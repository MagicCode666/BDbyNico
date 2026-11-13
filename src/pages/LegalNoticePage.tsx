import { Link } from 'react-router-dom'

import LegalLayout from '../components/LegalLayout'

export const CONTACT_EMAIL = 'bdbynico.app@gmail.com'

export default function LegalNoticePage() {
  return (
    <LegalLayout title="Mentions légales" updated="13 novembre 2026">
      <h2>Éditeur du service</h2>
      <p>
        BDbyNico est un service gratuit, sans publicité, édité à titre non professionnel par une
        personne physique qui a choisi de rester anonyme, comme le permet l’article 6, III, 2 de la
        loi du 21 juin 2004 pour la confiance dans l’économie numérique. Son identité a été
        communiquée aux hébergeurs ci-dessous.
      </p>
      <p>
        Contact et directeur de la publication : l’éditeur, joignable à l’adresse{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Hébergeurs</h2>
      <ul>
        <li>
          <strong>Site web</strong> (pages de l’application) : GitHub, Inc., 88 Colin P. Kelly Jr.
          Street, San Francisco, CA 94107, États-Unis (GitHub Pages).
        </li>
        <li>
          <strong>Comptes et données</strong> : Supabase, Inc. Les données sont stockées dans
          l’Union européenne (Irlande).
        </li>
      </ul>

      <h2>Contenu du catalogue</h2>
      <p>
        Les informations sur les albums (titres, auteurs, éditeurs, résumés, couvertures)
        proviennent notamment du catalogue de la Bibliothèque nationale de France, d’Open Library et
        de libraires en ligne, et de contributions des utilisateurs. Les couvertures restent la
        propriété de leurs éditeurs et ne sont pas stockées par le service : elles sont affichées
        depuis leur source. Pour demander le retrait d’un contenu, écrivez à l’adresse de contact.
      </p>
      <p>
        Nous retirons rapidement tout contenu signalé comme portant atteinte à vos droits. Indiquez
        l’adresse de l’album ou de la couverture concernée et ce qui justifie votre demande.
      </p>
      <p>
        Les utilisateurs s’engagent à ne contribuer (ajout d’albums, proposition de couvertures)
        qu’avec des contenus dont ils peuvent disposer. Le service peut retirer ceux qui portent
        atteinte aux droits de tiers.
      </p>

      <h2>Responsabilité</h2>
      <p>
        Le service est fourni gratuitement, tel quel, sans garantie de disponibilité ni d’exactitude
        des informations du catalogue. Pensez à exporter régulièrement votre collection (CSV) depuis
        votre profil.
      </p>

      <h2>Données personnelles</h2>
      <p>
        Voir la <Link to="/confidentialite">politique de confidentialité</Link>.
      </p>
    </LegalLayout>
  )
}
