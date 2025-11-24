export const checkRole = async (req, res, next) => {
    if (req.user.role !== 'User') return next()
    res.status(403).json({ error: "You can't access users." })
}
