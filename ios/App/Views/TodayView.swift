import SwiftUI

struct TodayView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.theme) var theme
    @State private var openMeal: Meal?

    var body: some View {
        NavigationStack {
            ZStack {
                theme.background.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        ScreenHeader(eyebrow: model.today.map { "\($0.weekday) · \($0.person.name)" } ?? "Heute", title: "Heute")
                        if let t = model.today {
                            TwoColumn {
                                summaryCard(t)
                                if let next = t.next { nextMealCard(next, today: t) }
                                waterCard(t)
                            } right: {
                                mealsCard(t)
                                nutrientsCard(t)
                            }
                        } else if model.loading {
                            ProgressView().padding(60)
                        } else {
                            emptyState
                        }
                        if let e = model.error {
                            Text(e).font(.footnote).foregroundStyle(theme.warn)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                    .readableWidth()
                }
                .refreshable { await model.refreshAll() }
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(item: $openMeal) { meal in MealDetail(meal: meal).environment(\.theme, theme).environmentObject(model) }
        }
    }

    // MARK: Kalorien & Makros
    private func summaryCard(_ t: TodayPayload) -> some View {
        VStack(spacing: 18) {
            HStack(spacing: 20) {
                ZStack {
                    KcalRing(progress: t.kcalProgress, lineWidth: 14, theme: theme)
                    VStack(spacing: 0) {
                        Text(t.eaten.kcal.de)
                            .font(.system(size: 30, weight: .bold, design: .rounded))
                            .foregroundStyle(theme.ink)
                            .contentTransition(.numericText())
                        Text("von \(t.targets.kcal.de) kcal")
                            .font(.caption).foregroundStyle(theme.muted)
                    }
                }
                .frame(width: 140, height: 140)
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(Int((t.kcalProgress * 100).rounded())) %")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .foregroundStyle(theme.accent)
                    Text(remainingText(t)).font(.subheadline).foregroundStyle(theme.ink2)
                    Text("Geplant: \(t.planned.kcal.de) kcal").font(.caption).foregroundStyle(theme.muted)
                }
                Spacer(minLength: 0)
            }
            VStack(spacing: 12) {
                macroRow("Protein", t.eaten.protein, t.targets.protein, theme.protein)
                macroRow("Kohlenhydrate", t.eaten.carbs, t.targets.carbs, theme.carbs)
                macroRow("Fett", t.eaten.fat, t.targets.fat, theme.fat)
            }
        }
        .card(padding: 18)
    }

    private func remainingText(_ t: TodayPayload) -> String {
        let rest = t.targets.kcal - t.eaten.kcal
        return rest >= 0 ? "Noch \(rest.de) kcal" : "\((-rest).de) kcal über Ziel"
    }

    private func macroRow(_ label: String, _ value: Int, _ target: Int, _ color: Color) -> some View {
        VStack(spacing: 6) {
            HStack {
                Circle().fill(color).frame(width: 8, height: 8)
                Text(label).font(.subheadline.weight(.semibold)).foregroundStyle(theme.ink)
                Spacer()
                Text("\(value.de) / \(target.de) g").font(.subheadline.monospacedDigit()).foregroundStyle(theme.ink2)
                Text("\(target > 0 ? Int((Double(value) / Double(target) * 100).rounded()) : 0) %")
                    .font(.caption.weight(.bold).monospacedDigit()).foregroundStyle(color)
                    .frame(width: 44, alignment: .trailing)
            }
            MacroBar(value: value, target: target, color: color, track: theme.track)
        }
    }

    // MARK: Nächste Mahlzeit
    private func nextMealCard(_ n: NextMeal, today t: TodayPayload) -> some View {
        Button {
            openMeal = t.meals.first { $0.slot == n.slot }
        } label: {
            HStack(spacing: 14) {
                VStack(spacing: 2) {
                    Text(n.time ?? "–").font(.system(.title2, design: .rounded).weight(.bold))
                    Text(n.label).font(.caption2.weight(.semibold))
                }
                .foregroundStyle(theme.onAccent)
                .frame(width: 74, height: 74)
                .background(theme.accent, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    Text("NÄCHSTE MAHLZEIT").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(theme.muted)
                    Text(n.name).font(.headline).foregroundStyle(theme.ink).multilineTextAlignment(.leading).lineLimit(2)
                    if let m = n.main, let g = m.grams {
                        Text("\(g) g \(m.name) · \(n.kcal.de) kcal · \(n.protein) g P")
                            .font(.footnote).foregroundStyle(theme.ink2)
                    }
                    if let at = timeToday(n.time), at > Date() {
                        Text("in \(at, style: .relative)").font(.caption.weight(.semibold)).foregroundStyle(theme.accent)
                    }
                }
                Spacer(minLength: 0)
            }
            .card(padding: 14)
        }
        .buttonStyle(.plain)
    }

    // MARK: Mahlzeiten
    private func mealsCard(_ t: TodayPayload) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Mahlzeiten").font(.headline).foregroundStyle(theme.ink).padding(.bottom, 6)
            ForEach(t.meals) { meal in
                HStack(spacing: 12) {
                    Button {
                        let gen = UIImpactFeedbackGenerator(style: .medium); gen.impactOccurred()
                        Task { await model.toggle(meal) }
                    } label: {
                        Image(systemName: meal.isDone ? "checkmark.circle.fill" : "circle")
                            .font(.title2)
                            .foregroundStyle(meal.isDone ? theme.accent : theme.muted)
                            .contentTransition(.symbolEffect(.replace))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(meal.isDone ? "\(meal.label) als nicht gegessen markieren" : "\(meal.label) als gegessen markieren")

                    Button { openMeal = meal } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(meal.label.uppercased())\(meal.time.map { " · \($0)" } ?? "")")
                                    .font(.caption2.weight(.bold)).tracking(0.8).foregroundStyle(theme.muted)
                                Text(meal.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.ink)
                                    .strikethrough(meal.isDone, color: theme.muted).lineLimit(2).multilineTextAlignment(.leading)
                                Text("\(meal.kcal.de) kcal · P \(meal.protein) · KH \(meal.carbs) · F \(meal.fat)")
                                    .font(.caption.monospacedDigit()).foregroundStyle(theme.ink2)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(theme.muted)
                        }
                    }
                    .buttonStyle(.plain)
                }
                .padding(.vertical, 8)
                if meal.id != t.meals.last?.id { Divider().overlay(theme.track) }
            }
        }
        .card()
    }

    // MARK: Nährstoffe
    private func nutrientsCard(_ t: TodayPayload) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Vitamine & Mineralstoffe").font(.headline).foregroundStyle(theme.ink)
                Spacer()
                Text("laut Plan").font(.caption).foregroundStyle(theme.muted)
            }
            let shown = t.micros.filter { !($0.isMax ?? false) && $0.pct != nil }.sorted { ($0.pct ?? 0) < ($1.pct ?? 0) }
            ForEach(shown.prefix(6)) { m in
                let pct = m.pct ?? 0
                let color = pct >= 100 ? theme.accent : pct >= 70 ? theme.carbs : theme.warn
                VStack(spacing: 5) {
                    HStack {
                        Text(m.label).font(.subheadline).foregroundStyle(theme.ink)
                        Spacer()
                        Text("\(pct) %").font(.subheadline.weight(.bold).monospacedDigit()).foregroundStyle(color)
                    }
                    MacroBar(value: pct, target: 100, color: color, track: theme.track, height: 6)
                }
            }
            if shown.count > 6 {
                Text("\(shown.dropFirst(6).filter { ($0.pct ?? 0) >= 100 }.count) weitere Nährstoffe zu 100 % gedeckt")
                    .font(.caption).foregroundStyle(theme.muted)
            }
        }
        .card()
    }

    // MARK: Wasser
    private func waterCard(_ t: TodayPayload) -> some View {
        HStack {
            Image(systemName: "drop.fill").foregroundStyle(theme.protein).font(.title3)
            VStack(alignment: .leading) {
                Text("Wasser").font(.subheadline.weight(.semibold)).foregroundStyle(theme.ink)
                Text("\((Double(t.water) / 1000).de(2)) l").font(.caption).foregroundStyle(theme.ink2)
            }
            Spacer()
            Button("−") { Task { await model.addWater(-250) } }.buttonStyle(.bordered).disabled(t.water <= 0)
            Button("+ 250 ml") { Task { await model.addWater(250) } }.buttonStyle(.borderedProminent)
        }
        .card(padding: 14)
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "wifi.exclamationmark").font(.largeTitle).foregroundStyle(theme.muted)
            Text("Noch keine Daten geladen").foregroundStyle(theme.ink2)
            Button("Nochmal versuchen") { Task { await model.refreshAll() } }.buttonStyle(.borderedProminent)
        }
        .padding(40)
    }
}

/// Zutaten & Zubereitung einer Mahlzeit.
struct MealDetail: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.theme) var theme
    @Environment(\.dismiss) var dismiss
    let meal: Meal

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 16) {
                        stat("\(meal.kcal.de)", "kcal", theme.accent)
                        stat("\(meal.protein)", "Protein", theme.protein)
                        stat("\(meal.carbs)", "KH", theme.carbs)
                        stat("\(meal.fat)", "Fett", theme.fat)
                    }
                    .frame(maxWidth: .infinity)
                }
                Section("Zutaten – deine Menge") {
                    ForEach(meal.ingredients) { i in
                        HStack {
                            Text(i.name)
                            if let n = i.note, !n.isEmpty { Text(n).font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            Text("\(i.grams ?? 0) g").monospacedDigit().fontWeight(.semibold)
                        }
                    }
                }
                if let steps = meal.steps, !steps.isEmpty {
                    Section("Zubereitung") {
                        ForEach(Array(steps.enumerated()), id: \.offset) { idx, s in
                            HStack(alignment: .top, spacing: 10) {
                                Text("\(idx + 1)").font(.caption.weight(.bold)).foregroundStyle(theme.onAccent)
                                    .frame(width: 22, height: 22).background(theme.accent, in: Circle())
                                Text(s)
                            }
                        }
                    }
                }
                Section {
                    Button {
                        Task { await model.toggle(meal); dismiss() }
                    } label: {
                        Label(meal.isDone ? "Doch nicht gegessen" : "Als gegessen markieren",
                              systemImage: meal.isDone ? "arrow.uturn.backward" : "checkmark.circle.fill")
                    }
                }
            }
            .navigationTitle(meal.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func stat(_ v: String, _ l: String, _ c: Color) -> some View {
        VStack(spacing: 2) {
            Text(v).font(.system(.title3, design: .rounded).weight(.bold)).foregroundStyle(c)
            Text(l).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
