import { OAuth2Client } from "google-auth-library";


const clientId = '1033076679945-rsv1k0qucoosvolkog576purksfr5s03.apps.googleusercontent.com'
const client = new OAuth2Client(clientId)


export default async function verifyGoogleIDToken(idToken) {
    try {
        const ticket = await client.verifyIdToken({ idToken, audience: clientId })
        const payload = ticket.getPayload()
        return payload
    } catch (err) {
        console.error("Error verifying Google ID token:", err)
    }
}