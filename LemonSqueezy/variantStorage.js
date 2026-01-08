const MB = 1024 * 1024;
const GB = 1024 * MB;
const TB = 1024 * GB;

export const varianstPlans = [
    {
        lsId: 1193383,
        name: 'Free',
        storageBytes: 500 * MB,
        maxUploadBytes: 100 * MB,
    },
    {
        lsId: 1193389,
        name: 'Pro-Monthly',
        storageBytes: 200 * GB,
        maxUploadBytes: 50 * GB,
    },
    {
        lsId: 1193390,
        name: 'Premium-Monthly',
        storageBytes: 2 * TB,
        maxUploadBytes: 100 * GB,
    },
    {
        lsId: 1193391,
        name: 'Free',
        storageBytes: 500 * MB,
        maxUploadBytes: 100 * MB,
    },
    {
        lsId: 1193392,
        name: 'Pro-Yearly',
        storageBytes: 200 * GB,
        maxUploadBytes: 2 * GB,
    },
    {
        lsId: 1193395,
        name: 'Premium-Yearly',
        storageBytes: 2 * TB,
        maxUploadBytes: 10 * GB,
    },
]




export function getPlanByVariantId(variantId) {
    return varianstPlans.find(p => p.lsId === Number(variantId)) || null;
}

export function getFreePlan() {
    return varianstPlans.find(p => p.name === 'Free');
}
