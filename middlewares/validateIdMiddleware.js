import { ObjectId } from "mongodb";

export default function validateIdMiddleware(req, res, next, value) {
    if (!ObjectId.isValid(value)) {
        return res.status(401).json({ error: `Invalid-ID: ${value}` });
    }
    next();
}
