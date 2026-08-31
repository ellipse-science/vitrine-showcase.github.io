package science.ellipse.vitrine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Contrairement au code Swift de `ios/`, celui-ci s'exécute pour de vrai à
 * chaque intégration : `Vitrine.estInterne` et les analyseurs JSON sont du
 * Kotlin pur, sans dépendance au cadriciel Android.
 */
class VitrineTest {

    @Test
    fun `le site lui-meme reste dans l application`() {
        assertTrue(Vitrine.estInterne("https://vitrinedemocratique.com/"))
        assertTrue(Vitrine.estInterne("https://vitrinedemocratique.com/apropos/"))
        assertTrue(Vitrine.estInterne("https://www.vitrinedemocratique.com/journal/"))
    }

    @Test
    fun `l API et l environnement de travail sont EXTERNES`() {
        // Le piège : un `endsWith(".vitrinedemocratique.com")` les classerait
        // internes et les ouvrirait DANS la vue web.
        assertFalse(Vitrine.estInterne("https://api.vitrinedemocratique.com/v1/art/latest.json"))
        assertFalse(Vitrine.estInterne("https://dev.vitrinedemocratique.com/"))
    }

    @Test
    fun `les sites tiers partent vers un onglet Chrome`() {
        assertFalse(Vitrine.estInterne("https://polimeter.org/"))
        assertFalse(Vitrine.estInterne("https://ellipse.science/"))
        assertFalse(Vitrine.estInterne("https://www.lapresse.ca/article"))
    }

    @Test
    fun `un hote qui imite le notre est externe`() {
        // « vitrinedemocratique.com.attaquant.net » ne doit jamais passer.
        assertFalse(Vitrine.estInterne("https://vitrinedemocratique.com.attaquant.net/"))
        assertFalse(Vitrine.estInterne("https://notvitrinedemocratique.com/"))
    }

    @Test
    fun `une adresse absente ou illisible n est pas interne`() {
        assertFalse(Vitrine.estInterne(null))
        assertFalse(Vitrine.estInterne(""))
        assertFalse(Vitrine.estInterne("pas une adresse"))
    }

    @Test
    fun `les schemas non web sont reconnus`() {
        assertTrue(Vitrine.estSchemaWeb("https://vitrinedemocratique.com/"))
        assertTrue(Vitrine.estSchemaWeb("http://exemple.org/"))
        assertFalse(Vitrine.estSchemaWeb("mailto:capp@ulaval.ca"))
        assertFalse(Vitrine.estSchemaWeb("tel:+15815551234"))
    }

    @Test
    fun `la Une se lit depuis la charge reelle du site`() {
        // Charge observée sur vitrinedemocratique.com le 2026-08-28.
        val brut = """
            {"event_id":"20260828T070000Z-evt-x","storyline_id":"story-caq-10963544",
             "title":"Élections québécoises : comparez les promesses des cinq partis",
             "main_issue":"governments_and_governance","date_utc":"2026-08-28",
             "time_interval_utc":"07-11","sum_qc":37.478,"peak_qc":82.11}
        """.trimIndent()
        val une = UneCourante.depuisJson(brut)
        assertEquals("Élections québécoises : comparez les promesses des cinq partis", une?.titre)
        assertEquals("governments_and_governance", une?.enjeu)
        assertEquals("Gouvernements et gouvernance", Enjeux.libelle(une?.enjeu))
    }

    @Test
    fun `un JSON casse ne fait pas planter la tuile`() {
        assertNull(UneCourante.depuisJson("{pas du json"))
        assertNull(UneCourante.depuisJson("{}"))
        assertNull(IdentifiantBuild.depuisJson(""))
    }

    @Test
    fun `l identifiant de build se lit avec sa date`() {
        val build = IdentifiantBuild.depuisJson(
            """{"id":"140e728-1787919248195","builtAt":"2026-08-28T12:14:08.195Z"}""",
        )
        assertEquals("140e728-1787919248195", build?.id)
        assertEquals(1787919248195L, build?.construitLe)
    }

    @Test
    fun `la fraicheur se dit en francais, heures collees au chiffre`() {
        val t = 1_800_000_000_000L
        assertEquals("à l'instant", Formats.fraicheur(t, t + 59 * 60_000))
        assertEquals("il y a 3h", Formats.fraicheur(t, t + 3 * 3_600_000))
        assertEquals("il y a 23h", Formats.fraicheur(t, t + 23 * 3_600_000))
        assertEquals("hier", Formats.fraicheur(t, t + 25 * 3_600_000))
        assertEquals("il y a 3 jours", Formats.fraicheur(t, t + 74 * 3_600_000))
        // Une horloge qui recule ne doit pas produire « il y a -2h ».
        assertEquals("à l'instant", Formats.fraicheur(t, t - 7_200_000))
    }

    @Test
    fun `les douze enjeux sont la, avec leurs couleurs`() {
        assertEquals(12, Enjeux.libelles.size)
        assertEquals(12, Enjeux.couleurs.size)
        assertEquals(Enjeux.libelles.keys, Enjeux.couleurs.keys)
        // Opaque, et la valeur de lib/enjeux.ts.
        assertEquals(0xFF234E78.toInt(), Enjeux.couleur("governments_and_governance"))
        assertEquals(0xFF463E3E.toInt(), Enjeux.couleur("enjeu_inconnu"))
        assertEquals(0xFF463E3E.toInt(), Enjeux.couleur(null))
    }
}
