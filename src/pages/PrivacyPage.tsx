import { Link } from 'react-router-dom'

import LegalLayout from '../components/LegalLayout'
import { CONTACT_EMAIL } from './LegalNoticePage'

export default function PrivacyPage() {
  return (
    <LegalLayout title="Politique de confidentialité" updated="12 novembre 2026">
      <p>
        BDbyNico collecte le strict nécessaire pour gérer votre collection. Pas de publicité, pas de
        statistiques de fréquentation, pas de traceurs, et vos données ne sont ni vendues ni cédées.
      </p>

      <h2>Responsable du traitement</h2>
      <p>
        L’éditeur du service (voir les <Link to="/mentions-legales">mentions légales</Link>),
        joignable à <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Données collectées et finalités</h2>
      <ul>
        <li>
          <strong>Compte</strong> : adresse email et mot de passe (conservé sous forme chiffrée),
          pseudo, avatar facultatif. Pour vous connecter et vous identifier auprès de vos amis.
        </li>
        <li>
          <strong>Collection</strong> : les albums que vous possédez ou souhaitez, avec vos
          informations facultatives (prix, état, notes, dédicace, édition originale), et vos
          réglages de séries. Pour vous offrir le service.
        </li>
        <li>
          <strong>Amis</strong> : vos demandes et relations d’amitié, et le choix de partager ou non
          votre collection avec chaque ami.
        </li>
        <li>
          <strong>Contributions au catalogue</strong> : les albums et corrections que vous ajoutez,
          qui restent visibles de tous, sans votre nom, après la suppression du compte.
        </li>
        <li>
          <strong>Emails du service</strong> : confirmation d’inscription et réinitialisation du mot
          de passe, envoyés par le service de courriels Gmail (Google).
        </li>
      </ul>
      <p>
        Base légale : l’exécution du service que vous demandez en créant un compte. Aucune décision
        automatisée n’est prise à votre sujet.
      </p>

      <h2>Qui voit quoi</h2>
      <ul>
        <li>
          <strong>Vos amis</strong> (après acceptation mutuelle) voient votre pseudo et votre
          avatar. Ils voient votre collection seulement si vous l’avez autorisé pour eux, ami par
          ami.
        </li>
        <li>
          <strong>Le lien de partage</strong>, si vous l’activez : toute personne qui le possède
          voit votre collection en lecture seule, avec les options (envies, dédicaces) que vous avez
          choisies. Vous pouvez le désactiver ou le régénérer à tout moment.
        </li>
        <li>
          Personne d’autre : les comptes ne sont pas listés et votre email n’est jamais montré.
        </li>
      </ul>

      <h2>Cookies et stockage local</h2>
      <p>
        Le service n’utilise aucun cookie publicitaire ni de mesure d’audience. Il enregistre
        seulement dans votre navigateur ce qui est indispensable à son fonctionnement : votre
        session de connexion et votre choix de thème. Aucun consentement n’est donc requis. Les
        couvertures d’albums sont chargées depuis des sites tiers (Bibliothèque nationale de France,
        Open Library, libraires en ligne) : ces sites voient alors votre adresse IP.
      </p>

      <h2>Hébergement et durée de conservation</h2>
      <p>
        Les données sont hébergées par Supabase dans l’Union européenne (Irlande). Elles sont
        conservées tant que votre compte existe, puis supprimées avec lui. Le site lui-même est
        servi par GitHub Pages.
      </p>

      <h2>Vos droits</h2>
      <ul>
        <li>
          <strong>Accès et portabilité</strong> : exportez toute votre collection en CSV depuis
          votre profil.
        </li>
        <li>
          <strong>Rectification</strong> : modifiez votre pseudo, votre avatar et vos albums depuis
          l’application.
        </li>
        <li>
          <strong>Effacement</strong> : « Supprimer mon compte » dans votre profil, immédiat et
          définitif. Votre compte, votre collection, vos réglages et vos amitiés sont supprimés.
        </li>
        <li>
          <strong>Opposition, limitation, autre question</strong> : écrivez à{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </li>
      </ul>
      <p>
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation
        auprès de la CNIL (<a href="https://www.cnil.fr">cnil.fr</a>).
      </p>
    </LegalLayout>
  )
}
