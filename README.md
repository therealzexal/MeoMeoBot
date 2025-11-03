<p align="center">
  <img src="./assets/icon.png" alt="MeoMeoBot Icon" width="100"/>


Développé pour [Soo_Meo ](https://www.twitch.tv/soo_meo) </br>
Basé sur Electron pour modérer, gérer les commandes + giveaway et chromecast.</p>
---

## Fonctionnalités :
- **Commandes** : permet d'input n'importe quelle commande avec une réponse directe dans le tchat Twitch.
> ⚠️ Publie directement le message via le compte Twitch connecté
- **Giveaway** : gère l'ouverture, la fermeture et le tirage au sort des participants avec possibilité d'envoi de message dans le tchat.
- **Chromecast** : permet aux utilisateurs de cast des vidéos
- **Mise à jour auto** : recherche les nouvelles versions sur les *Releases* publiques de ce dépôt

## Cast & Flux
- **Transcodage FFmpeg :** pour transcoder le flux à la volée
- **Codecs Cibles :** vidéo au codec **H.264** et audio au codec **AAC**
- **Stabilité :** débit binaire est optimisé à *500 kbps* pour le streaming à faible latence
> ⚠️ Si la diffusion ne démarre pas, vérifiez que le **Pare-feu Windows** autorise l'exécutable principal du bot à ouvrir des ports réseau (règle de trafic entrant/sortant)

## Connexion & Sécurité
- **Canal Twitch** : nom de chaîne
- **Nom du bot** : nom du compte Twitch utilisé
- **Token OAuth** : Access Token à générer [ici](https://twitchtokengenerator.com/)

## Stockage des configs
Toutes vos configurations personnalisées (commandes, mots bannis, etc.) sont stockées **localement** sur votre machine par `electron-store`. </br>
La mise à jour de l'application n'écrase jamais ces données.

## Build l'app
Incrémenter la version dans `package.json` et ajouter le `GH_TOKEN` dans l'env.</br>
`set GH_TOKEN=VOTRE_JETON && npm run publish` dans une invite de commande.
