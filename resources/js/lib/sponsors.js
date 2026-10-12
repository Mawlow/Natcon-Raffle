/**
 * The convention's sponsors, by tier, in the order the sponsor show plays
 * them: the co-presenter alone first, then the major sponsors, the minor
 * sponsors and the star benefactors.
 */
const BASE = 'https://filipinohomes123.s3.ap-southeast-1.amazonaws.com/filipinohomes-new/natcon/sponsors';
// An id is a sponsor logo on the server; a path ("/images/...") is a file in this app.
const logos = (ids) => ids.map((id) => (id.startsWith('/') ? id : `${BASE}/${id}.webp`));

export const SPONSOR_TIERS = [
    {
        key: 'co-presenter',
        kicker: 'Presented with our',
        title: 'Co-Presentor',
        size: 'hero',
        perSlide: 1,
        logos: logos([
            // Cebu Landmasters, from the app's own logo collection.
            '/images/logos/developers/cebu-landdmasters.png',
        ]),
    },
    {
        key: 'major',
        kicker: 'With thanks to our',
        title: 'Major Sponsors',
        size: 'lg',
        perSlide: 10,
        // Full slides of 10 (five to a row), the last one taking what is left.
        fill: true,
        logos: logos([
            '538580bc-672a-49ce-9520-c60efb88f692',
            'd0de734a-dc31-4b54-9ef2-f55d6c14864a',
            '36488067-ccbf-4719-86bb-3010a3ea2ebf',
            '4103b9dc-1f6a-4cb3-a419-3ebef9621ea2',
            '2c17efab-17e4-4274-a374-d93ec08a8713',
            '6d9b13d4-bf36-4320-8b29-7b45cce45aa1',
            '2837770f-a780-4bf3-af1d-8bf3e699eae3',
            'a04ead54-6361-4d6e-ad6d-710c2b03b81c',
            '8b2c4e1d-ec91-4e31-a0ef-01d383233716',
            'c91d1eae-0e16-4a88-b92f-1eec95842df9',
            'a4d89fa7-8fbe-4576-b3e8-442cf3007097',
            'a83f48f3-3f80-4e12-b580-a4ceb8417c0f',
            '8fd21d9e-d56c-415d-835d-a240235bc63b',
            '8c8114e9-b20a-4cdc-821e-de5d3194d472',
        ]),
    },
    {
        key: 'minor',
        kicker: 'With thanks to our',
        title: 'Minor Sponsors',
        size: 'md',
        perSlide: 10,
        logos: logos([
            '548bfa6c-fc80-4557-ae22-6568014eaa4c',
            'e9fc4ba7-adb7-49a1-909e-8db0e0051158',
            '205ff80c-5759-4386-9575-5ad984ffdf17',
            '85ef8557-57fa-4dcb-bd37-91554d88f8e5',
            'cbb728a4-71d6-4fe9-b13a-74f42223a0d8',
            'dcb9f252-a550-4230-b960-4706f7e1046a',
            'fc86f47b-7279-43b7-9dda-f7db6a38691e',
            '70f4083c-0718-4c47-8ef6-05f984585937',
            '79bbb2e9-7756-4789-840e-b197bffe3ac9',
            '369bf8a6-687a-4c78-945e-2dbe17a97d4e',
        ]),
    },
    {
        key: 'star',
        kicker: 'Honouring our',
        title: 'Star Benefactors',
        size: 'sm',
        perSlide: 10,
        // Full slides of 10 (five to a row), the last one taking what is left.
        fill: true,
        logos: logos([
            'c931d740-891f-469d-927e-f73d298f9834',
            'b518d007-3af7-4065-aeec-b17d37b2968a',
            '2f2fdc47-678c-45dc-8a45-522b5097ab89',
            'e3e8eca0-32b1-4d10-84ff-9785f52b6093',
            '4fb08de1-17ed-4ae2-98cd-685b91a3deec',
            'e96c8a34-b214-4748-a734-f19a38a554ff', // RTU Land, Inc. (with its name)
            '1e301a7a-558b-4dfc-94f1-6e4539035d56',
            '85363eb3-2461-4854-b53a-3baa013ce865',
            '0c8f7156-93cf-4871-8e5d-dd751b7f15ea',
            '31279965-7672-4af6-a411-e516b661fada',
            '91fa9e92-26cf-4f05-b1a6-c7f2b111d9f1',
            '27f48d8f-edf0-48a0-b9a8-2bec997e8ac6',
            '5aad6698-edda-4113-b7df-39cf89f51d6e',
            '9404850b-5142-4b14-af79-f43d92c3feb2',
            'bbd5ecc6-e7a8-438f-97d4-2e9c7db6dd76',
            'fa6a3cd6-10a4-4711-9bf0-c04e800295bf',
            'df3d1a07-8bf1-40bf-8553-a23adacce4e4',
            'ebdd164c-4dce-458a-aab4-7c382e90a498',
        ]),
    },
];

/**
 * Logos whose artwork sits small inside a lot of empty space in the file,
 * drawn larger so they read like their neighbours: id => how much larger.
 * The artwork grows inside its own box; the boxes and spacing are unchanged.
 */
const LOGO_SCALE = {
    'bbd5ecc6-e7a8-438f-97d4-2e9c7db6dd76': 2.0, // SAEKYUNG
    '85363eb3-2461-4854-b53a-3baa013ce865': 2.15, // KLMR
    '2f2fdc47-678c-45dc-8a45-522b5097ab89': 2.4, // Ferti Acres
    '1e301a7a-558b-4dfc-94f1-6e4539035d56': 2.3, // FMDC
    'e96c8a34-b214-4748-a734-f19a38a554ff': 1.35, // RTU Land
    '85ef8557-57fa-4dcb-bd37-91554d88f8e5': 1.55, // Explorer Davao Realty
    '0c8f7156-93cf-4871-8e5d-dd751b7f15ea': 2.0, // Riavin Realty
    '27f48d8f-edf0-48a0-b9a8-2bec997e8ac6': 1.6, // Horizon
    '91fa9e92-26cf-4f05-b1a6-c7f2b111d9f1': 1.45, // Sunberry Homes & Contempo
    'fa6a3cd6-10a4-4711-9bf0-c04e800295bf': 1.75, // Marrea
    // Tall marks that already fill their box's height: these grow into its padding.
    '36488067-ccbf-4719-86bb-3010a3ea2ebf': 1.35, // Aeon Luxe
    '538580bc-672a-49ce-9520-c60efb88f692': 1.5, // King Properties
    '2c17efab-17e4-4274-a374-d93ec08a8713': 1.6, // BE Residences
};

/** How much larger to draw a sponsor logo (1 for most). */
export const logoScale = (src) => LOGO_SCALE[src.slice(src.lastIndexOf('/') + 1, -'.webp'.length)] ?? 1;

/**
 * The show's slides: each tier split into as few slides as its `perSlide`
 * allows, with the logos shared out evenly so no slide ends on a lone logo
 * — or, for a `fill` tier, full slides of `perSlide` and the rest last.
 */
export const SPONSOR_SLIDES = SPONSOR_TIERS.flatMap((tier) => {
    const pages = Math.ceil(tier.logos.length / tier.perSlide);
    // A `fill` tier fills each slide to `perSlide`; the others share evenly.
    const per = tier.fill ? tier.perSlide : Math.ceil(tier.logos.length / pages);
    return Array.from({ length: pages }, (_, page) => ({
        tier,
        page,
        pages,
        logos: tier.logos.slice(page * per, (page + 1) * per),
    }));
});

/** Seconds each slide stays up, as offered in the Control Center. */
export const SPONSOR_INTERVALS = [5, 8, 12, 20];
export const DEFAULT_SPONSOR_INTERVAL = 8;

/** The NATCON logo atop the sponsor show, as a % of its default size. */
export const SPONSOR_LOGO_SIZE_MIN = 50;
export const SPONSOR_LOGO_SIZE_MAX = 250;
export const DEFAULT_SPONSOR_LOGO_SIZE = 100;
export const clampSponsorLogoSize = (value) => Math.min(SPONSOR_LOGO_SIZE_MAX, Math.max(SPONSOR_LOGO_SIZE_MIN, Math.round(value)));

export const wrapSlide = (index) => ((index % SPONSOR_SLIDES.length) + SPONSOR_SLIDES.length) % SPONSOR_SLIDES.length;
