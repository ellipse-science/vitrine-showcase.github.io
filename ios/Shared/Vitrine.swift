import Foundation

/// Adresses publiques du site. Tout est servi par le CDN Cloudflare, jamais par
/// l'API : c'est la règle de coût nul sous afflux du projet. L'application, comme
/// le site, ne parle jamais à api.vitrinedemocratique.com.
enum Vitrine {
    static let site = URL(string: "https://vitrinedemocratique.com/")!

    /// Identifiant de build, réécrit à chaque déploiement (~100 octets).
    /// Même sonde que le composant web `ActualisationAuto`.
    static let identifiantBuild = URL(string: "https://vitrinedemocratique.com/build-id.json")!

    /// La Une du bloc courant (~330 octets), seul fichier de données conservé
    /// dans `out/` par `scripts/postbuild.mjs`. Source de la tuile d'écran d'accueil.
    static let uneCourante = URL(string: "https://vitrinedemocratique.com/data/hero-selection.json")!

    /// Une navigation reste dans l'application si elle vise le site lui-même.
    /// Tout le reste part vers Safari.
    ///
    /// Liste explicite plutôt qu'un `hasSuffix(".vitrinedemocratique.com")` :
    /// ce raccourci classerait `api.vitrinedemocratique.com` comme interne et
    /// autoriserait la vue web à y naviguer, en contradiction avec la règle
    /// « jamais l'API » que cette application respecte par ailleurs. Il
    /// laisserait aussi passer `dev.`, qui est derrière Cloudflare Access.
    static func estInterne(_ url: URL) -> Bool {
        guard let hote = url.host?.lowercased() else { return false }
        return hote == "vitrinedemocratique.com" || hote == "www.vitrinedemocratique.com"
    }
}

/// La Une publiée pour le bloc courant.
///
/// NB : le fichier porte `time_interval_utc` (« 07-11 »), volontairement ignoré
/// ici. Le site étiquette ses éditions à l'heure de Montréal ; réafficher les
/// bornes UTC telles quelles ferait mentir la tuile à côté de la page. On montre
/// le titre et l'enjeu, et la fraîcheur vient de `build-id.json`.
struct UneCourante: Decodable, Equatable {
    let titre: String
    let enjeu: String?
    let identifiantHistoire: String?

    private enum CodingKeys: String, CodingKey {
        case titre = "title"
        case enjeu = "main_issue"
        case identifiantHistoire = "storyline_id"
    }
}

struct IdentifiantBuild: Decodable, Equatable {
    let id: String
    let builtAt: Date?

    private enum CodingKeys: String, CodingKey {
        case id, builtAt
    }

    init(from decoder: Decoder) throws {
        let bac = try decoder.container(keyedBy: CodingKeys.self)
        id = try bac.decode(String.self, forKey: .id)
        let brut = try bac.decodeIfPresent(String.self, forKey: .builtAt)
        builtAt = brut.flatMap(Formats.iso.date(from:))
    }
}

enum Formats {
    /// `builtAt` arrive en ISO 8601 avec millisecondes : « 2026-08-28T12:14:08.195Z ».
    static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// « à l'instant », « il y a 3h », « il y a 2 jours ».
    /// Heures collées au chiffre (`3h`), écart assumé à l'OQLF suivi par le projet.
    static func fraicheur(depuis date: Date, maintenant: Date = Date()) -> String {
        let secondes = max(0, maintenant.timeIntervalSince(date))
        let heures = Int(secondes / 3600)
        if heures < 1 { return "à l'instant" }
        if heures < 24 { return "il y a \(heures)h" }
        let jours = heures / 24
        return jours == 1 ? "hier" : "il y a \(jours) jours"
    }
}

/// Lecture réseau commune à l'application et à la tuile.
enum Lecteur {
    static func lire<T: Decodable>(_ type: T.Type, depuis url: URL) async throws -> T {
        var requete = URLRequest(url: url)
        // Ces deux fichiers changent à chaque déploiement : jamais de cache URLSession,
        // sinon la sonde de fraîcheur se compare à elle-même.
        requete.cachePolicy = .reloadIgnoringLocalCacheData
        requete.timeoutInterval = 15
        let (donnees, reponse) = try await URLSession.shared.data(for: requete)
        guard let http = reponse as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(T.self, from: donnees)
    }
}
