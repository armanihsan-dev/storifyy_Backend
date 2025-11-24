
import Session from '../models/sessionModel.js';
import User from './../models/userModel.js';


export default async function checkAuth(req, res, next) {
  const { sid } = req.signedCookies;
  if (!sid) {
    res.clearCookie('sid')
    return res.status(401).json({ error: "Not logged!" });
  }
  const session = await Session.findById(sid)
  if (!session) {
    res.clearCookie('sid')
    return res.status(200).json({ message: "Logged Out!" })
  }
  const user = await User.findOne({ _id: session.userId }).lean()

  if (!user) {
    return res.status(401).json({ error: "Not logged!" });
  }
  req.user = user
  next()
}


export function isStrongPassoword(req, res, next) {
  const { password } = req.body
  if (!password) {
    return res.status(400).json({ message: "Password is required" });
  }
  const strongPasswordRegex = /^(?=.*[0-9])(?=.*[A-Z])(?=.*[!@#$%^&*]).{8,}$/;
  if (!strongPasswordRegex.test(password)) {
    return res.status(400).json({
      error: "Weak password: must be 8+ chars, include uppercase, number & special symbol"
    });
  }
  next()
}