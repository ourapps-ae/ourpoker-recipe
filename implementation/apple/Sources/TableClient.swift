import Foundation

struct ApiError: Error, LocalizedError {
    let status: Int
    let code: String
    let message: String
    let view: GameView?
    var errorDescription: String? { message }
}

// Thin REST client for joining and acting; changes arrive over the live connections.
struct TableClient {
    let baseURL: URL
    private let session: URLSession
    init(baseURL: URL, session: URLSession? = nil) {
        self.baseURL = baseURL
        self.session = session ?? Self.makeSession()
    }

    private static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 35
        config.waitsForConnectivity = true
        return URLSession(configuration: config)
    }
    private let decoder = JSONDecoder()

    // Newest published release, relayed by the server from the store.
    func update() async throws -> UpdateInfo {
        let req = URLRequest(url: baseURL.appendingPathComponent("update"))
        return try decoder.decode(UpdateInfo.self, from: try await send(req))
    }

    // `token`: the seat token this device holds for the room; a name in use is given back only with it.
    func join(roomId: String, name: String, token: String? = nil) async throws -> JoinResponse {
        var req = URLRequest(url: baseURL.appendingPathComponent("r/\(roomId)/join"))
        req.httpMethod = "POST"
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        req.httpBody = try JSONSerialization.data(withJSONObject: ["name": name])
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try decoder.decode(JoinResponse.self, from: try await send(req))
    }

    // The table viewer: no seat, no name.
    func joinDisplay(roomId: String) async throws -> DisplayJoinResponse {
        var req = URLRequest(url: baseURL.appendingPathComponent("r/\(roomId)/display"))
        req.httpMethod = "POST"
        req.httpBody = Data("{}".utf8)
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try decoder.decode(DisplayJoinResponse.self, from: try await send(req))
    }

    func leaveDisplay(roomId: String, token: String) async {
        var req = URLRequest(url: baseURL.appendingPathComponent("r/\(roomId)/display/leave"))
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        _ = try? await send(req)
    }

    // Tells the table we are gone; errors do not matter.
    func away(roomId: String, token: String) async {
        var req = URLRequest(url: baseURL.appendingPathComponent("r/\(roomId)/away"))
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        _ = try? await send(req)
    }

    func action(roomId: String, token: String, expectedVersion: Int, type: String, fields: [String: Any] = [:], odds: Bool = false) async throws -> GameView {
        var body = fields
        body["type"] = type
        body["expectedVersion"] = expectedVersion
        body["odds"] = odds
        var req = URLRequest(url: baseURL.appendingPathComponent("r/\(roomId)/action"))
        req.httpMethod = "POST"
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return try decoder.decode(GameView.self, from: try await send(req))
    }

    private func send(_ req: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if (200..<300).contains(status) { return data }
        let err = try? decoder.decode(ErrorBody.self, from: data)
        throw ApiError(status: status, code: err?.error ?? "http", message: err?.message ?? "Server error \(status)", view: err?.view)
    }
}
