/* eslint-disable react/function-component-definition */
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Politique de confidentialité — InvincibleVoice',
  description:
    'Politique de confidentialité de l’application InvincibleVoice : données collectées, finalités, sous-traitants et droits des utilisateurs.',
};

const LAST_UPDATED = '17 juillet 2026';

export default function PrivacyPage() {
  return (
    <div className='min-h-screen bg-paper text-ink'>
      <main className='mx-auto max-w-3xl px-6 py-12'>
        <p className='mb-2 text-sm text-muted'>
          <Link
            href='/'
            className='text-blue hover:underline'
          >
            ← Retour à l’application
          </Link>
        </p>

        <h1 className='mb-2 text-3xl font-semibold tracking-tight'>
          Politique de confidentialité
        </h1>
        <p className='mb-10 text-sm text-muted'>
          Dernière mise à jour : {LAST_UPDATED}
        </p>

        <div className='space-y-8 text-base leading-relaxed text-ink-2'>
          <section>
            <h2 className='mb-3 text-xl font-semibold text-ink'>1. Objet</h2>
            <p>
              InvincibleVoice est une application d’aide à la communication pour
              les personnes qui ne peuvent plus parler facilement. Elle
              transcrit la voix de l’interlocuteur, propose des réponses
              possibles et permet à l’utilisateur de choisir celle qui sera
              prononcée à voix haute.
            </p>
            <p className='mt-3'>
              La présente politique décrit les données traitées lorsque vous
              utilisez l’application (site web, PWA ou application Android) et
              les services associés.
            </p>
          </section>

          <section>
            <h2 className='mb-3 text-xl font-semibold text-ink'>
              2. Responsable du traitement
            </h2>
            <p>
              L’application est déployée et administrée par l’opérateur de
              l’instance (l’administrateur qui vous a fourni un compte). Pour
              toute question relative à vos données, contactez cet
              administrateur via les coordonnées indiquées sur la fiche Play
              Store ou dans l’application.
            </p>
          </section>

          <section>
            <h2 className='mb-3 text-xl font-semibold text-ink'>
              3. Données collectées
            </h2>
            <ul className='list-disc space-y-2 pl-6'>
              <li>
                <strong>Compte utilisateur</strong> : adresse e-mail,
                identifiant de connexion (mot de passe chiffré ou identifiant
                Google lié au compte).
              </li>
              <li>
                <strong>Profil et préférences</strong> : nom affiché, langue,
                mots-clés, phrases rapides, amis/contacts saisis, réglages de
                l’interface.
              </li>
              <li>
                <strong>Audio et voix</strong> : enregistrements du microphone
                pour la transcription (reconnaissance vocale) et, le cas
                échéant, échantillon vocal pour le clonage de voix (fonction
                TTS).
              </li>
              <li>
                <strong>Historique de conversations</strong> : transcriptions,
                suggestions de réponses et échanges conservés pour le
                fonctionnement de l’application et la continuité des
                conversations.
              </li>
              <li>
                <strong>Données techniques</strong> : journaux techniques
                limités (authentification, erreurs) nécessaires à la sécurité et
                au bon fonctionnement du service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className='mb-3 text-xl font-semibold text-ink'>
              4. Finalités
            </h2>
            <p>Les données sont utilisées uniquement pour :</p>
            <ul className='mt-3 list-disc space-y-2 pl-6'>
              <li>authentifier les utilisateurs autorisés ;</li>
              <li>
                transcrire la parole et générer des suggestions de réponses ;
              </li>
              <li>synthétiser la réponse choisie (texte vers parole) ;</li>
              <li>
                sauvegarder les préférences et l’historique de l’utilisateur ;
              </li>
              <li>
                assurer la sécurité, la maintenance et le support du service.
              </li>
            </ul>
            <p className='mt-3'>
              InvincibleVoice <strong>n’est pas un dispositif médical</strong>{' '}
              et ne remplace pas un avis médical ou un diagnostic.
            </p>
          </section>

          <section>
            <h2 className='mb-3 text-xl font-semibold text-ink'>
              5. Permissions de l’application Android
            </h2>
            <p>
              L’application demande l’accès au <strong>microphone</strong> pour
              capturer la voix de l’interlocuteur et la transcrire. Sans cette
              permission, la fonction principale de transcription ne peut pas
              fonctionner.
            </p>
          </section>

          <section>
            <h2 className='mb-3 text-xl font-semibold text-ink'>
              6. Sous-traitants et hébergement
            </h2>
            <p>
              Selon la configuration de l’instance, les données peuvent être
              traitées par les prestataires suivants, agissant pour le compte de
              l’opérateur :
            </p>
            <ul className='mt-3 list-disc space-y-2 pl-6'>
              <li>
                <strong>Google Cloud</strong> — hébergement du backend et
                stockage des données utilisateur ;
              </li>
              <li>
                <strong>Gradium</strong> — reconnaissance vocale (STT) et
                synthèse vocale (TTS), y compris le clonage de voix le cas
                échéant ;
              </li>
              <li>
                <strong>Cerebras</strong> (ou autre fournisseur LLM configuré) —
                génération des suggestions de réponses ;
              </li>
              <li>
                <strong>Google</strong> — connexion OAuth (si activée) ;
              </li>
              <li>
                <strong>Firebase Hosting</strong> — hébergement de l’interface
                web (PWA), le cas échéant.
              </li>
            </ul>
            <p className='mt-3'>
              Les échanges avec ces services sont chiffrés en transit (HTTPS /
              WSS). L’accès à l’application est limité aux comptes provisionnés
              par l’administrateur ; l’inscription libre est désactivée.
            </p>
          </section>

          <section>
            <h2 className='mb-3 text-xl font-semibold text-ink'>
              7. Conservation et suppression
            </h2>
            <p>
              Les données sont conservées tant que le compte est actif et
              nécessaires au fonctionnement du service. Vous pouvez demander la
              suppression de votre compte et de vos données en contactant
              l’administrateur de l’instance.
            </p>
          </section>

          <section>
            <h2 className='mb-3 text-xl font-semibold text-ink'>
              8. Vos droits
            </h2>
            <p>
              Conformément au Règlement général sur la protection des données
              (RGPD), vous disposez d’un droit d’accès, de rectification, de
              suppression, de limitation et d’opposition concernant vos données
              personnelles. Pour exercer ces droits, contactez l’administrateur
              de l’instance.
            </p>
          </section>

          <section>
            <h2 className='mb-3 text-xl font-semibold text-ink'>
              9. Absence de vente de données
            </h2>
            <p>
              Vos données personnelles ne sont pas vendues à des tiers. Elles ne
              sont transmises qu’aux prestataires techniques listés ci-dessus,
              dans la stricte mesure nécessaire au fonctionnement du service.
            </p>
          </section>

          <section>
            <h2 className='mb-3 text-xl font-semibold text-ink'>
              10. Modifications
            </h2>
            <p>
              Cette politique peut être mise à jour. La date de dernière
              révision est indiquée en haut de cette page. En cas de changement
              important, l’administrateur pourra vous en informer par un moyen
              approprié.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
