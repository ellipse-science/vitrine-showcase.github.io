import SwiftUI
import WidgetKit

/// Tuile d'écran d'accueil : la Une du bloc courant.
///
/// Elle lit les deux petits fichiers publics servis par le CDN
/// (`hero-selection.json`, ~330 octets, et `build-id.json`, ~100 octets).
/// Jamais l'API : une tuile sur des milliers d'appareils qui interrogerait Neon
/// est exactement le scénario d'egress qui a coûté 5 Go en août.
struct FournisseurUne: TimelineProvider {
    func placeholder(in context: Context) -> EntreeUne {
        EntreeUne(
            date: Date(),
            une: UneCourante(
                titre: "La Une des Unes du bloc en cours",
                enjeu: "governments_and_governance",
                identifiantHistoire: nil
            ),
            publieeLe: Date()
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (EntreeUne) -> Void) {
        Task { completion(await charger()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<EntreeUne>) -> Void) {
        Task {
            let entree = await charger()
            // Le pipeline publie toutes les 4 h. Une relecture par demi-heure
            // suffit largement et reste loin du budget de rafraîchissement
            // qu'iOS accorde aux tuiles.
            let prochaine = Date().addingTimeInterval(30 * 60)
            completion(Timeline(entries: [entree], policy: .after(prochaine)))
        }
    }

    private func charger() async -> EntreeUne {
        async let une = try? Lecteur.lire(UneCourante.self, depuis: Vitrine.uneCourante)
        async let build = try? Lecteur.lire(IdentifiantBuild.self, depuis: Vitrine.identifiantBuild)
        return EntreeUne(date: Date(), une: await une, publieeLe: await build?.builtAt)
    }
}

struct EntreeUne: TimelineEntry {
    let date: Date
    let une: UneCourante?
    let publieeLe: Date?
}

struct VueTuileUne: View {
    @Environment(\.widgetFamily) private var famille
    let entree: EntreeUne

    private var enjeu: String? { Enjeux.libelle(entree.une?.enjeu) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle()
                    .fill(Enjeux.couleur(entree.une?.enjeu))
                    .frame(width: 7, height: 7)
                Text(enjeu ?? "La Une des Unes")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }

            Text(entree.une?.titre ?? "Édition indisponible")
                .font(famille == .systemSmall ? .caption.weight(.semibold) : .subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(famille == .systemSmall ? 4 : 3)
                .minimumScaleFactor(0.9)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)

            if let publiee = entree.publieeLe {
                Text(Formats.fraicheur(depuis: publiee))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        // Obligatoire depuis iOS 17 : sans elle la tuile s'affiche de travers.
        .containerBackground(for: .widget) {
            Color(.systemBackground)
        }
        .widgetURL(Vitrine.site)
    }
}

@main
struct VitrineWidget: Widget {
    private let genre = "science.ellipse.vitrine.une"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: genre, provider: FournisseurUne()) { entree in
            VueTuileUne(entree: entree)
        }
        .configurationDisplayName("La Une des Unes")
        .description("Le sujet en tête des Unes québécoises, mis à jour à chaque bloc.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
