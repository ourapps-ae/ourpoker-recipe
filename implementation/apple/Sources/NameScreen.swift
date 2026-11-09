import SwiftUI

// First run, and "Change name" later: the display name kept on this phone.
struct NameScreen: View {
    @Bindable var model: TableModel
    @State private var name = ""

    var body: some View {
        ZStack {
            PokerBackground()
            VStack(spacing: 12) {
                Spacer()
                Logo(width: 60)
                Text(L("app_name")).font(.largeTitle.bold())
                Spacer().frame(height: 16)
                Panel(title: L(model.name.isEmpty ? "first_run_title" : "change_name")) {
                    Text(L("first_run_body")).multilineTextAlignment(.center).frame(maxWidth: .infinity)
                    TextField(L("your_name"), text: $name)
                        .playerNameInput()
                        .onChange(of: name) { _, v in if v.count > 20 { name = String(v.prefix(20)) } }
                    HStack {
                        Spacer()
                        if !model.name.isEmpty || Platform.uprightBoard { Button(L("cancel")) { model.editingName = false; model.entryMode = nil } }
                        Button(L("save")) { model.setName(name) }
                            .buttonStyle(.borderedProminent)
                            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                Spacer()
            }
            .padding(24)
            .phoneColumn(help: { model.showHelp = true })
        }
        .onAppear { name = model.name }
    }
}
