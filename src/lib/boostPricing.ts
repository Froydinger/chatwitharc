import { BOOST_CHECKOUT_PLANS, BOOST_TRIAL_PERIOD_DAYS } from '../../supabase/functions/_shared/boostCatalog';

const monthlyDollars = BOOST_CHECKOUT_PLANS.monthly.unitAmount / 100;
const annualDollars = BOOST_CHECKOUT_PLANS.annual.unitAmount / 100;

export const BOOST_PRICE_ID = BOOST_CHECKOUT_PLANS.monthly.lookupKey;
export const BOOST_ANNUAL_PRICE_ID = BOOST_CHECKOUT_PLANS.annual.lookupKey;
export const BOOST_MONTHLY_PRICE_AMOUNT = `$${monthlyDollars}`;
export const BOOST_ANNUAL_PRICE_AMOUNT = `$${annualDollars}`;
export const BOOST_PRICE_DISPLAY = `${BOOST_MONTHLY_PRICE_AMOUNT}/month`;
export const BOOST_ANNUAL_PRICE_DISPLAY = `${BOOST_ANNUAL_PRICE_AMOUNT}/year`;
export const BOOST_ANNUAL_MONTHLY_EQUIVALENT = `$${(annualDollars / 12).toFixed(2)}`;
export const BOOST_ANNUAL_MONTHLY_COMPARISON = `$${monthlyDollars * 12}/year billed monthly`;
export const BOOST_ANNUAL_SAVINGS_DISPLAY = `Save ${Math.round((1 - annualDollars / (monthlyDollars * 12)) * 100)}%`;
export const BOOST_ANNUAL_RENEWAL_DISPLAY = `Renews at ${BOOST_ANNUAL_PRICE_DISPLAY} while subscribed`;
export const BOOST_GRANDFATHERING_COPY = 'Existing subscribers keep their current price, including renewals.';
export const BOOST_NEW_SUBSCRIBER_PRICE_COPY = `New Boost subscriptions on the website are ${BOOST_PRICE_DISPLAY} or ${BOOST_ANNUAL_PRICE_DISPLAY}. ${BOOST_GRANDFATHERING_COPY} Google Play pricing is shown in the app.`;
export { BOOST_TRIAL_PERIOD_DAYS };
export const BOOST_TRIAL_DISPLAY = `${BOOST_TRIAL_PERIOD_DAYS}-day free trial`;
export const BOOST_TRIAL_NOTE = 'Card required · cancel anytime';

// Compatibility names for existing consumers: these compare annual billing to
// twelve current monthly payments, not to a former annual selling price.
export const BOOST_ANNUAL_REGULAR_PRICE_AMOUNT = `$${monthlyDollars * 12}`;
export const BOOST_ANNUAL_REGULAR_PRICE_DISPLAY = BOOST_ANNUAL_MONTHLY_COMPARISON;
export const BOOST_ANNUAL_OFFER_BADGE = 'Annual savings';
