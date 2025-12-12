import { OAuth2Client } from "google-auth-library";


const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
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