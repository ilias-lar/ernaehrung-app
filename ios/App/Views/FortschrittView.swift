import SwiftUI
import Charts

struct FortschrittView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.theme) var theme
    @State private var kgText = ""
    @State private var date = Date()
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            theme.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    ScreenHeader(eyebrow: "Gewicht & Trend", title: "Fortschritt")
                    if let t = model.today {
                        summary(t.weight)
                        TwoColumn {
                            chart(t.weight)
                            entryCard
                        } right: {
                            history(t.weight)
                        }
                    } else {
                        ProgressView().padding(60)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 24)
                .readableWidth()
            }
            .refreshable { await model.refreshToday() }
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Fertig") { focused = false } }
        }
    }

    private func summary(_ w: WeightInfo) -> some View {
        HStack(spacing: 12) {
            tile("Aktuell", w.latest.map { "\($0.kg.de(1)) kg" } ?? "–", theme.ink)
            tile("Trend / Woche", w.kgPerWeek.map { ($0 >= 0 ? "+" : "") + $0.de(2) + " kg" } ?? "–",
                 (w.kgPerWeek ?? 0) >= 0 ? theme.accent : theme.carbs)
        }
    }

    private func tile(_ label: String, _ value: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(theme.muted)
            Text(value).font(.system(.title2, design: .rounded).weight(.bold)).foregroundStyle(color)
        }
        .card()
    }

    @ViewBuilder
    private func chart(_ w: WeightInfo) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Verlauf").font(.headline).foregroundStyle(theme.ink)
            if w.entries.count >= 2 {
                let lo = (w.entries.map(\.kg).min() ?? 0) - 1
                let hi = (w.entries.map(\.kg).max() ?? 0) + 1
                Chart(w.entries) { e in
                    AreaMark(x: .value("Tag", e.day), yStart: .value("min", lo), yEnd: .value("kg", e.kg))
                        .foregroundStyle(LinearGradient(colors: [theme.accent.opacity(0.25), .clear], startPoint: .top, endPoint: .bottom))
                        .interpolationMethod(.monotone)
                    LineMark(x: .value("Tag", e.day), y: .value("kg", e.kg))
                        .foregroundStyle(theme.accent).lineStyle(StrokeStyle(lineWidth: 2.5))
                        .interpolationMethod(.monotone)
                    PointMark(x: .value("Tag", e.day), y: .value("kg", e.kg))
                        .foregroundStyle(theme.accent).symbolSize(28)
                }
                .chartYScale(domain: lo...hi)
                .frame(height: 200)
            } else {
                Text("Ab zwei Einträgen siehst du hier deinen Verlauf. Am besten morgens nach dem Aufstehen wiegen.")
                    .font(.subheadline).foregroundStyle(theme.ink2)
            }
        }
        .card()
    }

    private var entryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Gewicht eintragen").font(.headline).foregroundStyle(theme.ink)
            HStack {
                TextField("z. B. 83,4", text: $kgText)
                    .keyboardType(.decimalPad)
                    .focused($focused)
                    .padding(12)
                    .background(theme.card2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                Text("kg").foregroundStyle(theme.ink2)
                DatePicker("", selection: $date, in: ...Date(), displayedComponents: .date).labelsHidden()
            }
            Button {
                let kg = Double(kgText.replacingOccurrences(of: ",", with: ".")) ?? 0
                guard kg > 30, kg < 300 else { return }
                focused = false
                Task { await model.addWeight(kg, date: date); kgText = "" }
            } label: {
                Text("Speichern").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(theme.accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .foregroundStyle(theme.onAccent)
            }
            .buttonStyle(.plain)
        }
        .card()
    }

    @ViewBuilder
    private func history(_ w: WeightInfo) -> some View {
        if !w.entries.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("Einträge").font(.headline).foregroundStyle(theme.ink).padding(.bottom, 4)
                ForEach(w.entries.reversed().prefix(14)) { e in
                    HStack {
                        Text(e.day, format: .dateTime.weekday(.abbreviated).day().month(.abbreviated))
                            .foregroundStyle(theme.ink2)
                        Spacer()
                        Text("\(e.kg.de(1)) kg").fontWeight(.semibold).monospacedDigit().foregroundStyle(theme.ink)
                        Button { Task { await model.deleteWeight(e) } } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(theme.muted)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Eintrag löschen")
                    }
                    .padding(.vertical, 6)
                }
            }
            .card()
        }
    }
}
