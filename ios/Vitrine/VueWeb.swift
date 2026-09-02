import SafariServices
import SwiftUI
import WebKit

/// État partagé entre SwiftUI et le `WKWebView`.
@MainActor
final class ModeleVueWeb: ObservableObject {
    /// Lien externe à ouvrir dans Safari (feuille modale).
    @Published var lienExterne: URL?
    /// Le premier chargement a échoué : on montre un écran natif, pas une page blanche.
    @Published var horsLigne = false
    @Published var chargeEnCours = true

    fileprivate weak var vueWeb: WKWebView?

    /// Rechargement qui revalide auprès du serveur. `reload()` ne suffit pas :
    /// il repasserait par le cache de WebKit et par le service worker du site,
    /// qui sert volontairement du HTML avec les données inlinées dedans.
    func rechargerDepuisLOrigine() {
        horsLigne = false
        vueWeb?.reloadFromOrigin()
    }

    func reessayer() {
        horsLigne = false
        chargeEnCours = true
        vueWeb?.load(URLRequest(url: Vitrine.site))
    }

    var urlPartageable: URL {
        vueWeb?.url ?? Vitrine.site
    }
}

struct VueWeb: UIViewRepresentable {
    @ObservedObject var modele: ModeleVueWeb

    func makeCoordinator() -> Coordinateur { Coordinateur(modele: modele) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // Magasin persistant : c'est lui qui garde le service worker du site et
        // son cache. Sans persistance, l'application perdrait la lecture hors
        // ligne à chaque lancement.
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true

        let vue = WKWebView(frame: .zero, configuration: config)
        vue.navigationDelegate = context.coordinator
        vue.uiDelegate = context.coordinator
        vue.allowsBackForwardNavigationGestures = true
        // Évite l'éclair blanc au lancement en thème sombre.
        vue.isOpaque = false
        vue.backgroundColor = .systemBackground
        vue.scrollView.backgroundColor = .systemBackground

        let tirer = UIRefreshControl()
        tirer.addTarget(
            context.coordinator,
            action: #selector(Coordinateur.tirerPourActualiser(_:)),
            for: .valueChanged
        )
        vue.scrollView.refreshControl = tirer

        modele.vueWeb = vue
        vue.load(URLRequest(url: Vitrine.site))
        return vue
    }

    func updateUIView(_ vue: WKWebView, context: Context) {}

    final class Coordinateur: NSObject, WKNavigationDelegate, WKUIDelegate {
        private let modele: ModeleVueWeb

        init(modele: ModeleVueWeb) {
            self.modele = modele
        }

        @objc func tirerPourActualiser(_ controle: UIRefreshControl) {
            modele.vueWeb?.reloadFromOrigin()
        }

        // MARK: Aiguillage des liens

        /// Le site pose 21 liens `target="_blank"` (Polimètre, ellipse.science,
        /// réseaux sociaux, GitHub) et renvoie vers les sites des médias.
        /// Sans ce délégué, WebKit refuse d'ouvrir une nouvelle fenêtre et le
        /// clic ne fait STRICTEMENT RIEN : ni erreur, ni navigation. C'est le
        /// défaut classique des applications qui enveloppent un site.
        func webView(
            _ vue: WKWebView,
            createWebViewWith config: WKWebViewConfiguration,
            for action: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = action.request.url {
                ouvrirAilleurs(url)
            }
            return nil
        }

        func webView(
            _ vue: WKWebView,
            decidePolicyFor action: WKNavigationAction,
            decisionHandler decision: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = action.request.url else {
                decision(.allow)
                return
            }

            // mailto:, tel:, itms-apps: — WebKit ne sait pas les traiter.
            let schema = url.scheme?.lowercased() ?? ""
            if !["http", "https", "about", "data", "blob", "file"].contains(schema) {
                Task { @MainActor in UIApplication.shared.open(url) }
                decision(.cancel)
                return
            }

            if Vitrine.estInterne(url) {
                decision(.allow)
                return
            }

            // Seules les navigations de la fenêtre principale sont détournées.
            // Une iframe ou une sous-ressource externe (police, image) doit
            // continuer à se charger normalement.
            let fenetrePrincipale = action.targetFrame?.isMainFrame ?? true
            guard fenetrePrincipale else {
                decision(.allow)
                return
            }

            // Clic explicite, ou demande de nouvelle fenêtre (`target="_blank"`,
            // pour laquelle `targetFrame` est nil) : direction Safari.
            // Tout le reste (redirection serveur, navigation programmée) passe,
            // plutôt que de casser un parcours légitime.
            if action.navigationType == .linkActivated || action.targetFrame == nil {
                ouvrirAilleurs(url)
                decision(.cancel)
            } else {
                decision(.allow)
            }
        }

        private func ouvrirAilleurs(_ url: URL) {
            guard ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
                Task { @MainActor in UIApplication.shared.open(url) }
                return
            }
            Task { @MainActor in
                modele.lienExterne = url
            }
        }

        // MARK: Cycle de chargement

        func webView(_ vue: WKWebView, didStartProvisionalNavigation nav: WKNavigation!) {
            Task { @MainActor in modele.chargeEnCours = true }
        }

        func webView(_ vue: WKWebView, didFinish nav: WKNavigation!) {
            Task { @MainActor in
                modele.chargeEnCours = false
                modele.horsLigne = false
                vue.scrollView.refreshControl?.endRefreshing()
            }
        }

        func webView(
            _ vue: WKWebView,
            didFailProvisionalNavigation nav: WKNavigation!,
            withError erreur: Error
        ) {
            terminer(vue, erreur: erreur)
        }

        func webView(_ vue: WKWebView, didFail nav: WKNavigation!, withError erreur: Error) {
            terminer(vue, erreur: erreur)
        }

        private func terminer(_ vue: WKWebView, erreur: Error) {
            let code = (erreur as NSError).code
            // -999 : navigation remplacée par une autre, ce n'est pas une panne.
            guard code != NSURLErrorCancelled else { return }
            Task { @MainActor in
                modele.chargeEnCours = false
                vue.scrollView.refreshControl?.endRefreshing()
                // Si une page est déjà affichée, on la garde : le service worker
                // sert sa copie et l'utilisateur peut continuer à lire.
                if vue.url == nil {
                    modele.horsLigne = true
                }
            }
        }
    }
}

/// Enveloppe `SFSafariViewController` : les liens sortants gardent les témoins,
/// le lecteur et le bouton de partage de Safari, sans quitter l'application.
struct FeuilleSafari: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let config = SFSafariViewController.Configuration()
        config.entersReaderIfAvailable = false
        let controleur = SFSafariViewController(url: url, configuration: config)
        controleur.preferredControlTintColor = UIColor(named: "AccentColor") ?? .label
        return controleur
    }

    func updateUIViewController(_ controleur: SFSafariViewController, context: Context) {}
}
