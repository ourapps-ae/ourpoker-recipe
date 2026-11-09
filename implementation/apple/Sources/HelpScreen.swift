import SwiftUI

// Rules text lives in Localizable.xcstrings (generated from i18n/strings.json); the server enforces them.
let helpSections = ["idea", "join", "play", "rebuy", "pause", "video"]

struct HelpScreen: View {
    let onClose: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(L("how_to_play")).font(.title.bold())
                    Spacer()
                    Button { onClose() } label: { Image(systemName: "xmark").font(.title3) }
                        .accessibilityLabel(L("done"))
                }
                ForEach(helpSections, id: \.self) { section in
                    Text(L("help_\(section)_t")).font(.headline).foregroundStyle(Palette.gold).padding(.top, 8)
                    Text(L("help_\(section)"))
                }
                Text(L("help_footer"))
                    .font(.footnote).foregroundStyle(.secondary).padding(.top, 16)
            }
            .padding(24)
            .phoneColumn()
        }
    }
}
