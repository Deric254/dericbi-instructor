/**
 * Groups of words that mean the same thing for the ideas the explain-back checks. A learner who says "costly" for "hurts" or
 * "purchase" for "pay" is saying the same thing, so every word in a group counts as every other. Groups are kept narrow on
 * purpose: words that carry different ideas (cost and price, profit and cash) are never put together.
 */
export const SYNONYM_GROUPS: string[][] = [
  ['often', 'frequent', 'regular', 'repeat', 'daily', 'common', 'always', 'recurring', 'everyday', 'habitual'],
  ['hurt', 'pain', 'painful', 'costly', 'expensive', 'struggle', 'trouble', 'burden', 'suffer', 'annoying', 'frustrating', 'serious', 'severe', 'eat', 'drain', 'waste', 'lose', 'damage', 'harm'],
  ['pay', 'spend', 'buy', 'purchase', 'hire', 'afford', 'invest', 'fund'],
  ['cope', 'workaround', 'deal', 'handle', 'manage', 'patch', 'fix', 'solve', 'tackle', 'overcome', 'resolve'],
  ['ask', 'interview', 'talk', 'speak', 'question', 'survey', 'listen', 'enquire', 'inquire', 'consult'],
  ['predict', 'forecast', 'hypothetical', 'imagine', 'speculate'],
  ['polite', 'kind', 'nice', 'flatter', 'courteous', 'agreeable', 'please', 'diplomatic', 'friendly'],
  ['customer', 'client', 'buyer', 'shopper', 'consumer', 'patron'],
  ['smallest', 'minimum', 'least', 'simplest', 'basic', 'bare', 'rough', 'tiny', 'lean', 'minimal', 'cheapest'],
  ['test', 'trial', 'experiment', 'pilot', 'validate', 'prove'],
  ['count', 'measure', 'record'],
  ['divide', 'split', 'ratio', 'fraction', 'proportion'],
  ['lowest', 'floor', 'bottom'],
  ['highest', 'ceiling', 'maximum'],
  ['value', 'worth', 'benefit', 'gain', 'advantage'],
  ['late', 'delay', 'overdue', 'unpaid', 'owe', 'credit', 'behind', 'slow'],
  ['month', 'monthly', 'period'],
  ['rent', 'salary', 'overhead', 'lease', 'wage'],
  ['rise', 'increase', 'grow', 'climb'],
  ['stay', 'constant', 'same', 'fixed', 'unchanged', 'flat'],
  ['cause', 'driver'],
  ['luck', 'chance', 'fluke', 'random', 'coincidence'],
  ['confirm', 'verify', 'official', 'authority'],
  ['change', 'update', 'differ', 'vary', 'revise', 'alter', 'shift'],
  ['borrow', 'loan', 'debt', 'lend'],
  ['saving', 'savings', 'reserve', 'nest'],
  ['owner', 'founder', 'entrepreneur'],
  ['sale', 'sell', 'revenue', 'income', 'turnover', 'takings'],
]
