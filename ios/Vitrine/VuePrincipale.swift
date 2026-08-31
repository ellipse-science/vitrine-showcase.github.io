import SwiftUI

/// Coquille de l'application : le site, plein cadre, sans chrome de navigateur.
/// C'est volontairement la même chose que la version « sur l'écran d'accueil »
/// de Safari, avec trois ajouts natifs que le web ne peut pas faire :
/// le bandeau de nouvelle édition survit à la mise en arrière-plan, les liens
/// sortants passent par Safari, et l'écran hors ligne est natif.
struct VuePrincipale: View {
    @StateObject private var modele = ModeleVueWeb()
    @StateObject private var veilleur = VeilleurEdition()
    @Environment(\.scenePhase) private var phase

    var body: some View {
        ZStack(alignment: .top) {
            Color(.systemBackground).ignoresSafeArea()

            VueWeb(modele: modele)
                .opacity(modele.horsLigne ? 0 : 1)

            if modele.horsLigne {
                VueHorsLigne { modele.reessayer() }
            }

            if veilleur.nouvelleEdition && !modele.horsLigne {
                BandeauNouvelleEdition {
                    veilleur.acquitter()
                    modele.rechargerDepuisLOrigine()
                }
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.25), value: veilleur.nouvelleEdition)
        .task { veilleur.demarrer() }
        .onChange(of: phase) { _, nouvelle in
            switch nouvelle {
            case .active:
                // Retour dans l'application : personne ne lisait, on recharge
                // sans rien demander plutôt que d'afficher un bandeau.
                Task {
                    if await veilleur.verifierAuRetour() {
                        veilleur.acquitter()
                        modele.rechargerDepuisLOrigine()
                    }
                }
            case .background:
                veilleur.arreter()
            default:
                break
            }
        }
        .sheet(item: Binding(
            get: { modele.lienExterne.map(LienExterne.init) },
            set: { modele.lienExterne = $0?.url }
        )) { lien in
            FeuilleSafari(url: lien.url).ignoresSafeArea()
        }
    }
}

/// `sheet(item:)` réclame un `Identifiable` ; `URL` ne l'est pas.
private struct LienExterne: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

private struct BandeauNouvelleEdition: View {
    let actualiser: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text("Une nouvelle édition est parue.")
                .font(.footnote)
                .foregroundStyle(.primary)
            Spacer(minLength: 0)
            Button("Actualiser", action: actualiser)
                .font(.footnote.weight(.semibold))
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.primary.opacity(0.08))
        )
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .shadow(color: .black.opacity(0.12), radius: 8, y: 2)
    }
}

private struct VueHorsLigne: View {
    let reessayer: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 36, weight: .light))
                .foregroundStyle(.secondary)
            Text("Hors ligne")
                .font(.title3.weight(.semibold))
            Text("La Vitrine démocratique a besoin d'une connexion pour charger l'édition en cours.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("Réessayer", action: reessayer)
                .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}
