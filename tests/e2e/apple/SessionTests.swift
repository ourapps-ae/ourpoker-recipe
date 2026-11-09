import XCTest
@testable import OurPoker

private final class SessionProtocol: URLProtocol {
    static var receive: ((SessionProtocol) -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { DispatchQueue.main.async { Self.receive?(self) } }
    override func stopLoading() {}

    func reply(_ object: Any) throws {
        let data = try JSONSerialization.data(withJSONObject: object)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}

final class SessionTests: XCTestCase {
    private func fixture(_ name: String = "betting") throws -> [String: Any] {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("server/fixtures/\(name).json")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    @MainActor
    private func model() -> TableModel {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SessionProtocol.self]
        let model = TableModel(client: TableClient(baseURL: URL(string: "http://session.test/")!, session: URLSession(configuration: configuration)), restore: false)
        model.name = "George"
        model.paused()
        return model
    }

    @MainActor
    private func preservingDefaults(_ body: () async throws -> Void) async rethrows {
        let keys = ["token", "roomId", "display", "beginner", "handPanel"]
        let saved = keys.map { UserDefaults.standard.object(forKey: $0) }
        defer {
            for (key, value) in zip(keys, saved) {
                if let value { UserDefaults.standard.set(value, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
            }
            SessionProtocol.receive = nil
        }
        try await body()
    }

    @MainActor
    func testLatePlayerJoinCannotReplaceBoardAndPrivateStateIsCleared() async throws {
        try await preservingDefaults {
            let model = model()
            let privateView = try fixture()
            var publicView = try fixture("lobby")
            publicView["display"] = true
            publicView["you"] = ""
            let room = try XCTUnwrap(publicView["roomId"] as? String)
            let joined = expectation(description: "player request delayed")
            let board = expectation(description: "board request")
            var pending: SessionProtocol?
            SessionProtocol.receive = { request in
                if request.request.url?.lastPathComponent == "join" { pending = request; joined.fulfill() }
                else { try! request.reply(["token": "board-token", "view": publicView]); board.fulfill() }
            }
            model.join(roomId: room)
            await fulfillment(of: [joined], timeout: 2)
            model.view = try JSONDecoder().decode(GameView.self, from: JSONSerialization.data(withJSONObject: privateView))
            model.betTo = 123
            model.zoom = .mine
            model.videoPlayerId = "private-player"
            model.showHelp = true
            model.joinAsDisplay(roomId: room)
            XCTAssertNil(model.view)
            XCTAssertNil(model.zoom)
            XCTAssertNil(model.betTo)
            XCTAssertNil(model.videoPlayerId)
            XCTAssertFalse(model.showHelp)
            XCTAssertTrue(model.guides.isEmpty)
            XCTAssertFalse(model.video.connected)
            await fulfillment(of: [board], timeout: 2)
            try await Task.sleep(nanoseconds: 50_000_000)
            try pending?.reply(["token": "player-token", "view": privateView, "video": NSNull()])
            try await Task.sleep(nanoseconds: 50_000_000)
            XCTAssertEqual(model.token, "board-token")
            XCTAssertTrue(model.display)
            XCTAssertTrue(model.view?.isDisplay == true)
            XCTAssertNil(model.view?.me)
            model.signOut()
        }
    }

    @MainActor
    func testLateActionCannotRestorePrivateViewOrSendBoardActions() async throws {
        try await preservingDefaults {
            let model = model()
            let privateView = try fixture()
            var publicView = try fixture("lobby")
            publicView["display"] = true
            publicView["you"] = ""
            let room = try XCTUnwrap(publicView["roomId"] as? String)
            model.token = "player-token"
            model.roomId = room
            model.view = try JSONDecoder().decode(GameView.self, from: JSONSerialization.data(withJSONObject: privateView))
            let action = expectation(description: "action delayed")
            let board = expectation(description: "board request")
            var pending: SessionProtocol?
            var actionCount = 0
            SessionProtocol.receive = { request in
                if request.request.url?.lastPathComponent == "action" { actionCount += 1; pending = request; action.fulfill() }
                else { try! request.reply(["token": "board-token", "view": publicView]); board.fulfill() }
            }
            model.check()
            await fulfillment(of: [action], timeout: 2)
            model.joinAsDisplay(roomId: room)
            await fulfillment(of: [board], timeout: 2)
            try await Task.sleep(nanoseconds: 50_000_000)
            var lateView = privateView
            lateView["version"] = 100000
            try pending?.reply(lateView)
            try await Task.sleep(nanoseconds: 50_000_000)
            model.check()
            model.show([0, 1])
            XCTAssertTrue(model.view?.isDisplay == true)
            XCTAssertEqual(actionCount, 1)
            XCTAssertNil(model.zoom)
            model.signOut()
        }
    }

    @MainActor
    func testDisplayJoinReplyAfterExitCannotRestoreSession() async throws {
        try await preservingDefaults {
            let model = model()
            var publicView = try fixture("lobby")
            publicView["display"] = true
            publicView["you"] = ""
            let requested = expectation(description: "display delayed")
            let released = expectation(description: "unused display released")
            var pending: SessionProtocol?
            SessionProtocol.receive = { request in
                if request.request.url?.lastPathComponent == "display" { pending = request; requested.fulfill() }
                else { try! request.reply([:]); released.fulfill() }
            }
            model.name = ""
            model.joinAsDisplay(roomId: "casino")
            await fulfillment(of: [requested], timeout: 2)
            model.stopDisplay()
            try pending?.reply(["token": "unused-board", "view": publicView])
            await fulfillment(of: [released], timeout: 2)
            XCTAssertNil(model.token)
            XCTAssertNil(model.view)
            XCTAssertFalse(model.display)
        }
    }
}
