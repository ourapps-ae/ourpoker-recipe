import XCTest
@testable import OurPoker

// Decodes every server fixture so contract drift fails here before it reaches a phone.
final class ContractTests: XCTestCase {
    private var fixturesDir: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("server/fixtures")
    }

    func testDecodesEveryFixture() throws {
        let files = try FileManager.default.contentsOfDirectory(at: fixturesDir, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
        XCTAssertFalse(files.isEmpty, "no fixtures at \(fixturesDir.path)")
        for file in files {
            let view = try JSONDecoder().decode(GameView.self, from: Data(contentsOf: file))
            XCTAssertEqual(view.contractVersion, contractVersion, file.lastPathComponent)
            XCTAssertNotEqual(view.phase, .unknown, file.lastPathComponent)
        }
        let betting = try JSONDecoder().decode(GameView.self, from: Data(contentsOf: fixturesDir.appendingPathComponent("betting.json")))
        XCTAssertEqual(betting.me?.cards.count, 2)
    }

    func testUnknownPhaseDecodesToUnknown() throws {
        let text = try String(contentsOf: fixturesDir.appendingPathComponent("lobby.json"), encoding: .utf8)
            .replacingOccurrences(of: "\"phase\": \"lobby\"", with: "\"phase\": \"somethingNew\"")
        let view = try JSONDecoder().decode(GameView.self, from: Data(text.utf8))
        XCTAssertEqual(view.phase, .unknown)
    }
}
