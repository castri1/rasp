import EventKit
import Foundation

let responsePath = CommandLine.arguments.count >= 4 ? CommandLine.arguments[3] : nil

enum BridgeFailure: Error {
    case invalidInput
    case accessDenied
    case timedOut
}

func fail(_ message: String) -> Never {
    let data = Data(("ERROR:" + message + "\n").utf8)
    if let responsePath { try? data.write(to: URL(fileURLWithPath: responsePath), options: .atomic) }
    else { FileHandle.standardError.write(Data((message + "\n").utf8)) }
    exit(1)
}

func waitForCallback(_ completed: @escaping () -> Bool, timeout: TimeInterval = 30) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while !completed() && Date() < deadline {
        RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.05))
    }
    return completed()
}

func requestAccess(_ store: EKEventStore) throws {
    var completed = false
    var granted = false
    var requestError: Error?
    if #available(macOS 14.0, *) {
        store.requestFullAccessToReminders { allowed, error in
            granted = allowed
            requestError = error
            completed = true
        }
    } else {
        store.requestAccess(to: .reminder) { allowed, error in
            granted = allowed
            requestError = error
            completed = true
        }
    }
    guard waitForCallback({ completed }) else { throw BridgeFailure.timedOut }
    guard requestError == nil, granted else { throw BridgeFailure.accessDenied }
}

func jsonPayload() throws -> [String: Any] {
    guard CommandLine.arguments.count >= 3,
          let data = CommandLine.arguments[2].data(using: .utf8),
          let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw BridgeFailure.invalidInput }
    return value
}

func writeJSON(_ value: Any) throws {
    var data = try JSONSerialization.data(withJSONObject: value, options: [])
    data.append(Data("\n".utf8))
    if let responsePath { try data.write(to: URL(fileURLWithPath: responsePath), options: .atomic) }
    else { FileHandle.standardOutput.write(data) }
}

let store = EKEventStore()
do {
    guard CommandLine.arguments.count >= 2 else { throw BridgeFailure.invalidInput }
    try requestAccess(store)
    let action = CommandLine.arguments[1]
    let calendars = store.calendars(for: .reminder)

    if action == "lists" {
        try writeJSON(calendars.map { ["id": $0.calendarIdentifier, "name": $0.title] })
        exit(0)
    }

    let payload = try jsonPayload()
    if action == "tasks" {
        guard let listIds = payload["listIds"] as? [String] else { throw BridgeFailure.invalidInput }
        let selected = calendars.filter { listIds.contains($0.calendarIdentifier) }
        let predicate = store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: selected)
        var completed = false
        var fetched: [EKReminder]?
        store.fetchReminders(matching: predicate) { reminders in
            fetched = reminders
            completed = true
        }
        guard waitForCallback({ completed }), let reminders = fetched else { throw BridgeFailure.timedOut }
        let formatter = ISO8601DateFormatter()
        let result: [[String: Any]] = reminders.map { reminder in
            var item: [String: Any] = [
                "id": reminder.calendarItemIdentifier,
                "title": reminder.title ?? "Recordatorio",
                "notes": reminder.notes ?? "",
                "listId": reminder.calendar.calendarIdentifier,
                "listName": reminder.calendar.title,
                "dueAt": "",
                "priority": reminder.priority,
            ]
            if let date = reminder.dueDateComponents?.date { item["dueAt"] = formatter.string(from: date) }
            return item
        }
        try writeJSON(result)
        exit(0)
    }

    if action == "complete" {
        guard let taskId = payload["taskId"] as? String,
              let reminder = store.calendarItem(withIdentifier: taskId) as? EKReminder else { throw BridgeFailure.invalidInput }
        reminder.isCompleted = true
        reminder.completionDate = Date()
        try store.save(reminder, commit: true)
        try writeJSON(["completed": true])
        exit(0)
    }

    throw BridgeFailure.invalidInput
} catch BridgeFailure.accessDenied {
    fail("Autoriza Recordatorios para Rasp en Ajustes del Sistema.")
} catch BridgeFailure.timedOut {
    fail("Recordatorios no respondió a tiempo.")
} catch {
    fail("No se pudo completar la acción en Recordatorios.")
}
