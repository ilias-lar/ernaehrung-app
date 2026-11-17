import SwiftUI

struct ShoppingView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.theme) var theme

    var body: some View {
        ZStack {
            theme.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    ScreenHeader(eyebrow: "Woche · für euch beide", title: "Einkauf")
                    if let s = model.shopping {
                        totals(s)
                        ForEach(s.groups) { g in group(g) }
                    } else {
                        ProgressView().padding(60)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 24)
            }
            .refreshable { await model.refreshShopping() }
        }
    }

    private func totals(_ s: ShoppingPayload) -> some View {
        let all = s.groups.flatMap(\.items)
        let done = all.filter(\.checked).count
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(done) von \(all.count)").font(.system(.title, design: .rounded).weight(.bold)).foregroundStyle(theme.ink)
                Text("erledigt").foregroundStyle(theme.ink2)
                Spacer()
                if let w = s.weekCzk {
                    VStack(alignment: .trailing) {
                        Text("\(w.de) Kč").font(.headline.monospacedDigit()).foregroundStyle(theme.accent)
                        Text("pro Woche · ca. \((s.monthCzk ?? 0).de) Kč/Monat").font(.caption2).foregroundStyle(theme.muted)
                    }
                }
            }
            MacroBar(value: done, target: max(all.count, 1), color: theme.accent, track: theme.track)
        }
        .card()
    }

    private func group(_ g: ShopGroup) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(g.label).font(.headline).foregroundStyle(theme.ink).padding(.bottom, 6)
            ForEach(g.items) { item in
                Button { Task { await model.toggle(item) } } label: {
                    HStack(spacing: 12) {
                        Image(systemName: item.checked ? "checkmark.circle.fill" : "circle")
                            .font(.title3).foregroundStyle(item.checked ? theme.accent : theme.muted)
                        Text(item.name).foregroundStyle(item.checked ? theme.muted : theme.ink)
                            .strikethrough(item.checked, color: theme.muted)
                        Spacer()
                        Text(item.amount).font(.subheadline.weight(.semibold).monospacedDigit()).foregroundStyle(theme.ink2)
                    }
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .card()
    }
}
