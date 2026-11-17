import ActivityKit
import WidgetKit
import SwiftUI

struct MealLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MealActivityAttributes.self) { context in
            LockScreenActivityView(state: context.state, theme: Theme.of(context.attributes.theme), name: context.attributes.personName)
                .activityBackgroundTint(Theme.of(context.attributes.theme).background.opacity(0.92))
                .activitySystemActionForegroundColor(Theme.of(context.attributes.theme).accent)
        } dynamicIsland: { context in
            let theme = Theme.of(context.attributes.theme)
            let s = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ZStack {
                        KcalRing(progress: s.progress, lineWidth: 6, theme: theme)
                        Text("\(Int((s.progress * 100).rounded()))%").font(.system(size: 12, weight: .bold, design: .rounded))
                    }
                    .frame(width: 52, height: 52)
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        if let t = s.mealTime, t > Date() {
                            Text(timerInterval: Date()...t, countsDown: true)
                                .font(.system(.title3, design: .rounded).weight(.bold).monospacedDigit())
                                .foregroundStyle(theme.accent)
                                .multilineTextAlignment(.trailing)
                                .frame(maxWidth: 80, alignment: .trailing)
                        } else {
                            Text(s.allDone ? "✓" : "jetzt").font(.system(.title3, design: .rounded).weight(.bold)).foregroundStyle(theme.accent)
                        }
                        Text(s.mealLabel).font(.caption2).foregroundStyle(.secondary)
                    }
                    .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 1) {
                        Text(s.mainName.map { name in "\(s.mainGrams.map { "\($0) g " } ?? "")\(name)" } ?? s.mealLabel)
                            .font(.headline).lineLimit(1)
                        Text(s.mealName).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 6) {
                        MacroBar(value: s.kcalEaten, target: s.kcalTarget, color: theme.accent, track: Color.white.opacity(0.12), height: 6)
                        HStack {
                            Text("\(s.kcalEaten.de) / \(s.kcalTarget.de) kcal")
                            Spacer()
                            Text("Protein \(s.proteinEaten) / \(s.proteinTarget) g")
                        }
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 6)
                }
            } compactLeading: {
                ZStack {
                    KcalRing(progress: s.progress, lineWidth: 3.5, theme: theme)
                }
                .frame(width: 20, height: 20)
                .padding(.leading, 2)
            } compactTrailing: {
                if let t = s.mealTime, t > Date() {
                    Text(t, style: .time).font(.caption.weight(.bold).monospacedDigit()).foregroundStyle(theme.accent)
                } else {
                    Text("\(Int((s.progress * 100).rounded()))%").font(.caption.weight(.bold)).foregroundStyle(theme.accent)
                }
            } minimal: {
                KcalRing(progress: s.progress, lineWidth: 3, theme: theme).frame(width: 18, height: 18)
            }
            .keylineTint(theme.accent)
        }
    }
}

