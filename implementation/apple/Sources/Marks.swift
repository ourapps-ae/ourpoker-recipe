import SwiftUI

// The application's mark and the poker legend's lines under cards.

// The legend's line under a card: green for a card in a hand (Palette.good), gold for a community card
// or place (Palette.gold).
func legendLineHeight(_ width: CGFloat) -> CGFloat { max(4, width * 0.07) }

extension View {
    // The line hangs below the card's frame, so the card keeps its place.
    func legendLine(_ colour: Color, width: CGFloat) -> some View {
        overlay(alignment: .bottom) {
            Capsule().fill(colour).frame(width: width, height: legendLineHeight(width)).offset(y: 3 + legendLineHeight(width))
        }
    }
}

// The app mark: an ace of spades and a tilted king of hearts.
struct Logo: View {
    var width: CGFloat = 44
    var body: some View {
        HStack(spacing: -width * 0.25) {
            PlayingCard(code: "As", width: width)
            PlayingCard(code: "Kh", width: width).rotationEffect(.degrees(12)).offset(y: width * 0.14)
        }
    }
}

// GAP: G9.3 a small numbered badge for lobby and standings lists. No component provides it (the seating
// and tournament components give the rows, not the badge).
struct SeatNumber: View {
    let n: Int
    var body: some View {
        Text(String(n)).font(.caption.bold()).foregroundStyle(Palette.gold)
            .frame(width: 28, height: 28).background(Palette.gold.opacity(0.2), in: Circle())
    }
}

// The computer-player icon with a small plus in the corner.
struct AddBotIcon: View {
    let tint: Color
    var size: CGFloat = 24
    var body: some View { BadgedIcon(path: IconPath.robot, tint: tint, badge: "plus", size: size) }
}
