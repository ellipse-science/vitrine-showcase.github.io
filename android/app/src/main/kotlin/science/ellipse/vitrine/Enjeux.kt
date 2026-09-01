package science.ellipse.vitrine

/**
 * Les douze catégories d'enjeux du CAP.
 *
 * ⚠️ MIROIR de `lib/enjeux.ts`, qui reste la source de vérité, et troisième
 * copie après `ios/Shared/Enjeux.swift`. Les libellés sont partagés avec le
 * Digital Society Lab et l'Institut Donald J. Savoie : les changer d'un seul
 * côté casserait la comparabilité entre projets. `tests/applications.test.ts`
 * compare les trois copies à chaque intégration.
 *
 * Les clés sont recopiées au caractère près du pipeline, y compris ses
 * irrégularités (`health_and_social_services`, `international_affairs_and_defense`,
 * `rights_liberties_minorities_discrimination` sans « and »).
 */
object Enjeux {
    val libelles: Map<String, String> = mapOf(
        "economy_and_labour" to "Économie et travail",
        "governments_and_governance" to "Gouvernements et gouvernance",
        "health_and_social_services" to "Santé et politiques sociales",
        "environment_and_energy" to "Environnement et énergie",
        "rights_liberties_minorities_discrimination" to "Droits, libertés, minorités et discrimination",
        "culture_and_nationalism" to "Culture et nationalisme",
        "education" to "Éducation",
        "international_affairs_and_defense" to "Affaires internationales et défense",
        "law_and_crime" to "Loi et crime",
        "public_lands_and_agriculture" to "Terres publiques et agriculture",
        "immigration" to "Immigration",
        "technology" to "Technologie",
    )

    val couleurs: Map<String, String> = mapOf(
        "economy_and_labour" to "94781B",
        "governments_and_governance" to "234E78",
        "health_and_social_services" to "852244",
        "environment_and_energy" to "3D6B3A",
        "rights_liberties_minorities_discrimination" to "553278",
        "culture_and_nationalism" to "384873",
        "education" to "752373",
        "international_affairs_and_defense" to "1F5E66",
        "law_and_crime" to "993322",
        "public_lands_and_agriculture" to "5E731F",
        "immigration" to "9E541B",
        "technology" to "997018",
    )

    const val COULEUR_DEFAUT = "463E3E"

    fun libelle(cle: String?): String? = cle?.let { libelles[it] }

    /** « 234E78 » vers un entier de couleur opaque. */
    fun couleur(cle: String?): Int {
        val hex = couleurs[cle] ?: COULEUR_DEFAUT
        return (0xFF000000L or hex.toLong(16)).toInt()
    }
}
