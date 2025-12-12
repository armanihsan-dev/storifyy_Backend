export const validate = (schema, route) => (req, res, next) => {
    if (!req.body || typeof req.body !== "object") {
        return res.status(400).json({
            error: "Please fill all the required fields",
        });
    }

    const { name, email, password, otp } = req.body;

    // REQUIRED FIELD CHECKS BASED ON ROUTE
    if (route === "register") {
        if (!name || !email || !password || !otp) {
            return res.status(400).json({
                error: "Fill all required fields including OTP verification",
            });
        }
    }

    if (route === "login") {
        if (!email || !password) {
            return res.status(400).json({
                error: "Please fill all the required fields",
            });
        }
    }

    // ZOD VALIDATION
    const result = schema.safeParse(req.body);

    if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
            field: issue.path[0],
            message: issue.message,
        }));

        return res.status(400).json({ errors });
    }

    req.body = result.data;
    next();
};


export const validateOTP = (schema) => (req, res, next) => {
    // Check if body exists
    if (!req.body || typeof req.body !== "object") {
        return res.status(400).json({
            errors: [{ message: "Request body is missing" }]
        });
    }

    const result = schema.safeParse(req.body);

    if (!result.success) {
        const errors = result.error.issues.map(issue => ({
            field: issue.path[0],
            message: issue.message
        }));

        return res.status(400).json({ errors });
    }

    req.body = result.data; // sanitized
    next();
};


export const validateEmail = (schema) => (req, res, next) => {
    // Check if body exists
    if (!req.body || typeof req.body !== "object") {
        return res.status(400).json({
            errors: [{ message: "Request body is missing" }]
        })
    }
    const result = schema.safeParse(req.body);
    if (!result.success) {
        const errors = result.error.issues.map(issue => ({
            field: issue.path[0],
            message: issue.message
        }))
    }
    req.body = result.data; // sanitized

    next();
}