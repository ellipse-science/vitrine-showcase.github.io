import Foundation

/// Surveille la parution d'une nouvelle édition.
///
/// Transposition native de `components/interactive/ActualisationAuto.tsx`, et
/// pour la même raison : les données sont inlinées dans le HTML au build, donc
/// une page gardée en mémoire est une édition figée. Deux caches se superposent
/// ici (celui de WebKit et le service worker du site, en `networkFirst`) ; sans
/// cette sonde, quelqu'un qui laisse l'application ouverte peut relire pendant
/// des jours la même Une.
///
/// Comportement, calqué sur le web :
///   - retour dans l'application : rechargement silencieux (personne ne lisait) ;
///   - pendant la lecture : un bandeau discret, jamais de rechargement sous les yeux.
@MainActor
final class VeilleurEdition: ObservableObject {
    /// Une édition plus récente est parue et la page affichée est périmée.
    @Published private(set) var nouvelleEdition = false

    private var reference: String?
    private var minuterie: Task<Void, Never>?

    private let intervalle: Duration = .seconds(10 * 60)

    /// Premier passage : pose la référence sans rien signaler.
    func demarrer() {
        guard minuterie == nil else { return }
        minuterie = Task { [weak self] in
            while !Task.isCancelled {
                await self?.verifier()
                try? await Task.sleep(for: self?.intervalle ?? .seconds(600))
            }
        }
    }

    func arreter() {
        minuterie?.cancel()
        minuterie = nil
    }

    /// Retour au premier plan. Renvoie `true` si la page mérite un rechargement.
    func verifierAuRetour() async -> Bool {
        await verifier()
        return nouvelleEdition
    }

    func acquitter() {
        nouvelleEdition = false
    }

    private func verifier() async {
        guard let build = try? await Lecteur.lire(IdentifiantBuild.self, depuis: Vitrine.identifiantBuild)
        else {
            // Hors ligne, ou vieux déploiement sans le fichier : la sonde se tait
            // et l'application continue de fonctionner.
            return
        }
        guard let connu = reference else {
            reference = build.id
            return
        }
        if build.id != connu {
            reference = build.id
            nouvelleEdition = true
        }
    }
}
