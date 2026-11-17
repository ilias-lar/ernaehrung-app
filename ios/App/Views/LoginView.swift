import SwiftUI

struct LoginView: View {
    @EnvironmentObject var model: AppModel
    @State private var register = false
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var code = ""
    @State private var server = SharedStore.server
    @State private var showServer = false
    @State private var busy = false
    @State private var error: String?

    // Vor dem Login kennen wir die Person nicht – Registrieren (= Freundin) wird rosa.
    private var theme: Theme { register ? .freundin : .ilias }

    var body: some View {
        ZStack {
            theme.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Spacer(minLength: 40)
                    Image(systemName: register ? "hare.fill" : "leaf.fill")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(theme.onAccent)
                        .frame(width: 58, height: 58)
                        .background(theme.accent, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    VStack(alignment: .leading, spacing: 6) {
                        Text(register ? "Willkommen ♡" : "Ernährung")
                            .font(.system(.largeTitle, design: .rounded).weight(.bold))
                            .foregroundStyle(theme.ink)
                        Text(register ? "Mit dem Einladungscode dein eigenes Konto anlegen." : "Melde dich mit deinem Konto an.")
                            .foregroundStyle(theme.ink2)
                    }

                    VStack(spacing: 12) {
                        if register {
                            field("Dein Name", text: $name, content: .nickname)
                            field("Einladungscode (z. B. ABCD-EFGH)", text: $code, content: .oneTimeCode)
                                .textInputAutocapitalization(.characters)
                        }
                        field("E-Mail", text: $email, content: .username)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                        SecureField("Passwort (mind. 8 Zeichen)", text: $password)
                            .textContentType(register ? .newPassword : .password)
                            .padding(14)
                            .background(theme.card2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .foregroundStyle(theme.ink)
                    }

                    if let error {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(theme.warn)
                    }

                    Button(action: submit) {
                        HStack {
                            if busy { ProgressView().tint(theme.onAccent) }
                            Text(register ? "Konto anlegen" : "Anmelden").font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(theme.accent, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .foregroundStyle(theme.onAccent)
                    }
                    .disabled(busy || email.isEmpty || password.count < 8 || (register && code.isEmpty))

                    Button(register ? "Ich habe schon ein Konto" : "Einladungscode bekommen? Registrieren") {
                        withAnimation(.snappy) { register.toggle(); error = nil }
                    }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(theme.accent)
                    .frame(maxWidth: .infinity)

                    DisclosureGroup(isExpanded: $showServer) {
                        field("Server-Adresse", text: $server, content: .URL)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                    } label: {
                        Text("Server").font(.caption).foregroundStyle(theme.muted)
                    }
                    .tint(theme.muted)
                    .padding(.top, 20)
                }
                .padding(24)
            }
        }
        .preferredColorScheme(theme.colorScheme)
    }

    private func field(_ title: String, text: Binding<String>, content: UITextContentType) -> some View {
        TextField(title, text: text)
            .textContentType(content)
            .autocorrectionDisabled()
            .padding(14)
            .background(theme.card2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .foregroundStyle(theme.ink)
    }

    private func submit() {
        busy = true; error = nil
        SharedStore.server = server.hasSuffix("/") ? String(server.dropLast()) : server
        Task {
            defer { busy = false }
            do {
                let api = APIClient(server: SharedStore.server, token: nil)
                let r = register
                    ? try await api.register(code: code, name: name, email: email, password: password)
                    : try await api.login(email: email, password: password)
                model.signedIn(r)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
