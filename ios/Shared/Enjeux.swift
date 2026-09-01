import SwiftUI

/// Les douze catégories d'enjeux du CAP.
///
/// ⚠️ MIROIR de `lib/enjeux.ts`, qui reste la source de vérité. Les libellés
/// sont partagés avec le Digital Society Lab et l'Institut Donald J. Savoie :
/// les changer d'un seul côté casserait la comparabilité entre projets.
/// Les clés sont recopiées au caractère près du pipeline, y compris ses
/// irrégularités (`health_and_social_services`, `international_affairs_and_defense`,
/// `rights_liberties_minorities_discrimination` sans « and »).
enum Enjeux {
    static let libelles: [String: String] = [
        "economy_and_labour": "Économie et travail",
        "governments_and_governance": "Gouvernements et gouvernance",
        "health_and_social_services": "Santé et politiques sociales",
        "environment_and_energy": "Environnement et énergie",
        "rights_liberties_minorities_discrimination": "Droits, libertés, minorités et discrimination",
        "culture_and_nationalism": "Culture et nationalisme",
        "education": "Éducation",
        "international_affairs_and_defense": "Affaires internationales et défense",
        "law_and_crime": "Loi et crime",
        "public_lands_and_agriculture": "Terres publiques et agriculture",
        "immigration": "Immigration",
        "technology": "Technologie",
    ]

    static let couleurs: [String: String] = [
        "economy_and_labour": "94781B",
        "governments_and_governance": "234E78",
        "health_and_social_services": "852244",
        "environment_and_energy": "3D6B3A",
        "rights_liberties_minorities_discrimination": "553278",
        "culture_and_nationalism": "384873",
        "education": "752373",
        "international_affairs_and_defense": "1F5E66",
        "law_and_crime": "993322",
        "public_lands_and_agriculture": "5E731F",
        "immigration": "9E541B",
        "technology": "997018",
    ]

    static let couleurDefaut = "463E3E"

    static func libelle(_ cle: String?) -> String? {
        guard let cle else { return nil }
        return libelles[cle]
    }

    static func couleur(_ cle: String?) -> Color {
        Color(hex: couleurs[cle ?? ""] ?? couleurDefaut)
    }
}

extension Color {
    /// « 234E78 » vers une couleur. Les valeurs viennent toutes de `lib/enjeux.ts`.
    init(hex: String) {
        var valeur: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&valeur)
        self.init(
            .sRGB,
            red: Double((valeur >> 16) & 0xFF) / 255,
            green: Double((valeur >> 8) & 0xFF) / 255,
            blue: Double(valeur & 0xFF) / 255,
            opacity: 1
        )
    }
}
