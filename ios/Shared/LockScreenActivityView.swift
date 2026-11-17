import SwiftUI

struct LockScreenActivityView: View {
    let state: MealActivityAttributes.ContentState
    let theme: Theme
    let name: String

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                KcalRing(progress: state.progress, lineWidth: 7, theme: theme)
                VStack(spacing: 0) {
                    Text(state.kcalEaten.de).font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(theme.ink)
                    Text("kcal").font(.system(size: 9)).foregroundStyle(theme.muted)
                }
            }
            .frame(width: 62, height: 62)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Image(systemName: theme.mascot).font(.caption2).foregroundStyle(theme.accent)
                    Text(state.allDone ? "Alles erledigt" : "Als Nächstes · \(state.mealLabel)")
                        .font(.caption.weight(.semibold)).foregroundStyle(theme.muted)
                }
                Text(state.mainName.map { n in "\(state.mainGrams.map { "\($0) g " } ?? "")\(n)" } ?? state.mealName)
                    .font(.headline).foregroundStyle(theme.ink).lineLimit(1)
                Text("\(state.kcalEaten.de) / \(state.kcalTarget.de) kcal · \(state.proteinEaten)/\(state.proteinTarget) g P")
                    .font(.caption.monospacedDigit()).foregroundStyle(theme.ink2)
            }
            Spacer(minLength: 0)
            if let t = state.mealTime, t > Date() {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(t, style: .time).font(.system(.title3, design: .rounded).weight(.bold)).foregroundStyle(theme.accent)
                    Text(timerInterval: Date()...t, countsDown: true)
                        .font(.caption2.monospacedDigit()).foregroundStyle(theme.muted)
                        .multilineTextAlignment(.trailing).frame(maxWidth: 64, alignment: .trailing)
                }
            }
        }
        .padding(16)
    }
}
