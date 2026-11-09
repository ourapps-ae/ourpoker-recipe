import XCTest
@testable import OurPoker

// Crowded showdowns from the server's fixtures (five and six hands shown): every shown hand gets
// a spot, and no two rows, nor a row and the board or the winning cards, overlap, on a 6.1 and a 6.9 inch phone. The
// smallest phones (the SE's 375 point screen) cannot fit that many rows apart.
final class ChallengeLayoutTests: XCTestCase {
    private func fixture(_ name: String) throws -> GameView {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("server/fixtures")
        return try JSONDecoder().decode(GameView.self, from: Data(contentsOf: dir.appendingPathComponent("\(name).json")))
    }

    func testCrowdedShowdownsDoNotOverlap() throws {
        for name in ["showdownFive", "showdownSeven"] {
            let view = try fixture(name)
            let sd = try XCTUnwrap(Showdown.of(view), name)
            let n = max(2, view.players.count)
            for w in [378.0, 416.0] {
                let h = w * 1.3
                let spots = ChallengeLayout.place(sd, view: view, n: n, w: w, h: h)
                var rows: [CGRect] = []
                for p in sd.players {
                    let parts = ChallengeLayout.parts(p, winner: sd.isWinner(p.id))
                    if parts.combo.isEmpty && parts.unused.isEmpty { continue }
                    let spot = try XCTUnwrap(spots[p.id], "\(name) w=\(w) \(p.name)")
                    let size = ChallengeLayout.size(parts.combo, parts.unused.count, named: spot.named)
                    rows.append(CGRect(x: spot.at.x - size.width / 2, y: spot.at.y - size.height / 2, width: size.width, height: size.height))
                }
                let board = CGRect(x: w / 2 - 108, y: h / 2 - 28, width: 216, height: 63)
                // The winning cards over the pot, with the winner's name to their left.
                let rowWidth = 5 * sd.cardWidth + 4 * Showdown.gap + Showdown.kickerGap
                let showcase = CGRect(x: w * Spots.pot.x - rowWidth / 2 - 72, y: h * Spots.pot.y - sd.top, width: rowWidth + 72, height: CGFloat(sd.winners.count) * sd.rowHeight + 21)
                for (i, a) in rows.enumerated() {
                    XCTAssertFalse(ChallengeLayout.hits(a, board), "\(name) w=\(w): row \(i) on the board")
                    XCTAssertFalse(ChallengeLayout.hits(a, showcase), "\(name) w=\(w): row \(i) on the winning cards")
                    for b in rows[(i + 1)...] { XCTAssertFalse(ChallengeLayout.hits(a, b), "\(name) w=\(w): rows overlap") }
                }
            }
        }
    }
}
