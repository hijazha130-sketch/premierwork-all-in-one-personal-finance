import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "@/state/dataContext";
import { Button, Card, Field, Segmented, SelectInput, TextInput } from "@/components/ui";
import { defaultCategoryInputs } from "@/data/seed";
import { parseMajorToMinor } from "@/lib/money";
import { todayIso } from "@/lib/period";
import type { AccountType, BudgetMethod, RecurringFrequency, TransactionDirection } from "@/domain/types";

/**
 * Setup — the first-run wizard (Section 8). A short, guided sequence, one
 * decision per step: currency → accounts → people (optional) → groups → income
 * (optional) → regular bills (optional). Progress indicator, Back on every step,
 * Skip on optional steps. Finishing lands the user on Home.
 */
type DraftAccount = { name: string; type: AccountType; balance: string };
type DraftPerson = { name: string };
type DraftIncome = { name: string; amount: string };
type DraftBill = { name: string; direction: TransactionDirection; amount: string; frequency: RecurringFrequency; startDate: string };

const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: "everyMonth", label: "Monthly" },
  { value: "everyWeek", label: "Weekly" },
  { value: "every2Weeks", label: "Every 2 weeks" },
  { value: "every4Weeks", label: "Every 4 weeks" },
  { value: "every2Months", label: "Every 2 months" },
  { value: "everyQuarter", label: "Every 3 months" },
  { value: "every6Months", label: "Every 6 months" },
  { value: "everyYear", label: "Yearly" },
  { value: "oneTime", label: "One time" },
];

const CURRENCIES = [
  { code: "PKR", symbol: "Rs", locale: "en-PK" },
  { code: "USD", symbol: "$", locale: "en-US" },
  { code: "GBP", symbol: "£", locale: "en-GB" },
  { code: "EUR", symbol: "€", locale: "en-IE" },
  { code: "INR", symbol: "₹", locale: "en-IN" },
  { code: "AED", symbol: "AED", locale: "en-AE" },
];

const STEPS = ["Currency", "Accounts", "People", "Groups", "Income", "Bills", "Budget"];
const OPTIONAL_STEPS = [2, 4, 5, 6]; // People, Income, Bills, Budget

export function Setup() {
  const { repo } = useData();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [currency, setCurrency] = useState(CURRENCIES[0]);
  const [accounts, setAccounts] = useState<DraftAccount[]>([{ name: "", type: "checking", balance: "" }]);
  const [people, setPeople] = useState<DraftPerson[]>([]);
  const [groups, setGroups] = useState(() => defaultCategoryInputs().map((c) => ({ ...c, on: true })));
  const [incomes, setIncomes] = useState<DraftIncome[]>([]);
  const [bills, setBills] = useState<DraftBill[]>([]);
  const [budgetMethod, setBudgetMethod] = useState<BudgetMethod>("carryOver");
  const [budgets, setBudgets] = useState<Record<string, string>>({}); // group name -> planned amount
  const [error, setError] = useState("");

  // The kept spend groups the budget step can plan (not income).
  const budgetableGroups = groups.filter((g) => g.on && g.bucket !== "income");

  const validAccounts = accounts.filter((a) => a.name.trim());

  function next() {
    setError("");
    if (step === 1 && validAccounts.length === 0) {
      setError("Add at least one account to continue.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function finish() {
    setBusy(true);
    try {
      await repo.saveSettings({
        currencyCode: currency.code,
        currencySymbol: currency.symbol,
        locale: currency.locale,
        budgetMethod,
        setupComplete: true,
      });
      let firstAccountId = "";
      for (const a of validAccounts) {
        const created = await repo.createAccount({
          name: a.name.trim(),
          type: a.type,
          openingBalance: parseMajorToMinor(a.balance || "0") ?? 0,
          currencyCode: currency.code,
          archived: false,
        });
        if (!firstAccountId) firstAccountId = created.id;
      }
      for (const p of people.filter((p) => p.name.trim())) {
        await repo.createPerson({ name: p.name.trim(), archived: false });
      }
      const categoryByName = new Map<string, string>();
      for (const g of groups.filter((g) => g.on)) {
        const created = await repo.createCategory({
          name: g.name,
          bucket: g.bucket,
          needsWantsSavings: g.needsWantsSavings,
          color: g.color,
          archived: false,
        });
        categoryByName.set(g.name, created.id);
      }
      // Optional monthly budget: set the usual planned amount per group.
      for (const g of budgetableGroups) {
        const amount = parseMajorToMinor(budgets[g.name] ?? "");
        const categoryId = categoryByName.get(g.name);
        if (categoryId && amount != null && amount > 0) {
          await repo.setBudgetTemplate(categoryId, amount);
        }
      }
      for (const inc of incomes.filter((i) => i.name.trim())) {
        await repo.createIncomeSource({
          name: inc.name.trim(),
          defaultAmount: inc.amount ? parseMajorToMinor(inc.amount) ?? undefined : undefined,
          archived: false,
        });
      }
      // Regular bills & income become repeating rules against the first account
      // (they can be refined — group, account, person — later in Money → Repeating).
      if (firstAccountId) {
        for (const b of bills) {
          const amount = parseMajorToMinor(b.amount);
          if (!b.name.trim() || amount == null || amount <= 0) continue;
          await repo.createRecurringRule({
            name: b.name.trim(),
            amount,
            direction: b.direction,
            type: b.direction === "in" ? "income" : "expense",
            categoryId: null,
            accountId: firstAccountId,
            personId: null,
            frequency: b.frequency,
            anchorDate: b.startDate || todayIso(),
            endDate: null,
          });
        }
      }
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup couldn't finish.");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-gold" : "bg-inset"}`} />
            <div className={`mt-2 text-[11px] ${i === step ? "text-ink font-medium" : "text-muted"}`}>{label}</div>
          </div>
        ))}
      </div>

      <Card>
        {step === 0 && (
          <StepShell title="Pick your currency" blurb="This is how every amount shows up across the app.">
            <Field label="Currency">
              <SelectInput
                value={currency.code}
                onChange={(e) => setCurrency(CURRENCIES.find((c) => c.code === e.target.value) ?? CURRENCIES[0])}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} — {c.code}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <p className="text-sm text-muted">Amounts will look like <span className="font-amount text-ink">{currency.symbol} 1,250</span>.</p>
          </StepShell>
        )}

        {step === 1 && (
          <StepShell title="Add your accounts" blurb="Where your money lives — an everyday account, savings, cash. You can add more later.">
            <div className="space-y-3">
              {accounts.map((a, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <TextInput placeholder="e.g. Everyday" value={a.name} onChange={(e) => setAccounts(upd(accounts, i, { name: e.target.value }))} />
                  </div>
                  <div className="col-span-4">
                    <SelectInput value={a.type} onChange={(e) => setAccounts(upd(accounts, i, { type: e.target.value as AccountType }))}>
                      <option value="checking">Everyday</option>
                      <option value="savings">Savings</option>
                      <option value="cash">Cash</option>
                      <option value="credit">Credit card</option>
                      <option value="investment">Investment</option>
                      <option value="loan">Loan</option>
                    </SelectInput>
                  </div>
                  <div className="col-span-3">
                    <TextInput inputMode="decimal" placeholder="Balance" value={a.balance} onChange={(e) => setAccounts(upd(accounts, i, { balance: e.target.value }))} />
                  </div>
                </div>
              ))}
              <button className="text-sm text-gold hover:underline" onClick={() => setAccounts([...accounts, { name: "", type: "checking", balance: "" }])}>
                + Add another account
              </button>
            </div>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell title="Who spends in your household?" blurb="Optional. Add household members to track who spent what. You can skip this.">
            <div className="space-y-3">
              {people.map((p, i) => (
                <TextInput key={i} placeholder="Name" value={p.name} onChange={(e) => setPeople(upd(people, i, { name: e.target.value }))} />
              ))}
              <button className="text-sm text-gold hover:underline" onClick={() => setPeople([...people, { name: "" }])}>
                + Add a person
              </button>
            </div>
          </StepShell>
        )}

        {step === 3 && (
          <StepShell title="How your money is grouped" blurb="We've filled in sensible groups. Keep the ones you want — you can edit all of these later.">
            <div className="flex flex-wrap gap-2">
              {groups.map((g, i) => (
                <button
                  key={g.name}
                  onClick={() => setGroups(upd(groups, i, { on: !g.on }))}
                  className={`inline-flex items-center gap-2 rounded-pill border px-3 py-2 text-sm ${
                    g.on ? "border-gold text-ink bg-gold/10" : "border-hairline text-muted"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }} aria-hidden />
                  {g.name}
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {step === 4 && (
          <StepShell title="Where your money comes from" blurb="Optional. Add income sources for faster entry later — like Salary. You can skip this.">
            <div className="space-y-3">
              {incomes.map((inc, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <div className="col-span-7">
                    <TextInput placeholder="e.g. Salary" value={inc.name} onChange={(e) => setIncomes(upd(incomes, i, { name: e.target.value }))} />
                  </div>
                  <div className="col-span-5">
                    <TextInput inputMode="decimal" placeholder="Usual amount (optional)" value={inc.amount} onChange={(e) => setIncomes(upd(incomes, i, { amount: e.target.value }))} />
                  </div>
                </div>
              ))}
              <button className="text-sm text-gold hover:underline" onClick={() => setIncomes([...incomes, { name: "", amount: "" }])}>
                + Add an income source
              </button>
            </div>
          </StepShell>
        )}

        {step === 5 && (
          <StepShell
            title="Add your regular bills & income"
            blurb="Optional. Add repeating bills (like rent) and income (like salary). They'll show up with their next date — no re-typing. You can skip and add these later."
          >
            <div className="space-y-3">
              {bills.map((b, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 sm:col-span-4">
                    <TextInput placeholder="e.g. Rent" value={b.name} onChange={(e) => setBills(upd(bills, i, { name: e.target.value }))} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <SelectInput value={b.direction} onChange={(e) => setBills(upd(bills, i, { direction: e.target.value as TransactionDirection }))}>
                      <option value="out">Bill</option>
                      <option value="in">Income</option>
                    </SelectInput>
                  </div>
                  <div className="col-span-8 sm:col-span-2">
                    <TextInput inputMode="decimal" placeholder="Amount" value={b.amount} onChange={(e) => setBills(upd(bills, i, { amount: e.target.value }))} />
                  </div>
                  <div className="col-span-7 sm:col-span-2">
                    <SelectInput value={b.frequency} onChange={(e) => setBills(upd(bills, i, { frequency: e.target.value as RecurringFrequency }))}>
                      {FREQUENCIES.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </SelectInput>
                  </div>
                  <div className="col-span-5 sm:col-span-2">
                    <TextInput type="date" value={b.startDate} onChange={(e) => setBills(upd(bills, i, { startDate: e.target.value }))} />
                  </div>
                </div>
              ))}
              <button
                className="text-sm text-gold hover:underline"
                onClick={() => setBills([...bills, { name: "", direction: "out", amount: "", frequency: "everyMonth", startDate: todayIso() }])}
              >
                + Add a bill or income
              </button>
            </div>
          </StepShell>
        )}

        {step === 6 && (
          <StepShell
            title="Set your monthly budget"
            blurb="Optional. Plan what you'll spend on each group — you'll see spent and left fill in from your real activity. You can change all of this anytime in Plan."
          >
            <div className="space-y-5">
              <div>
                <span className="block text-sm font-medium text-ink mb-2">How should leftover money work?</span>
                <Segmented
                  ariaLabel="How leftover money works"
                  value={budgetMethod}
                  onChange={setBudgetMethod}
                  options={[
                    { value: "carryOver", label: "Roll leftover into next month" },
                    { value: "zeroBased", label: "Give every rupee a job" },
                  ]}
                />
              </div>
              {budgetableGroups.length === 0 ? (
                <p className="text-sm text-muted">Keep some spending groups in the previous step to plan a budget.</p>
              ) : (
                <div className="space-y-2">
                  {budgetableGroups.map((g) => (
                    <div key={g.name} className="flex items-center gap-3">
                      <span className="flex flex-1 min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }} aria-hidden />
                        <span className="truncate text-ink">{g.name}</span>
                      </span>
                      <TextInput
                        inputMode="decimal"
                        placeholder="0"
                        value={budgets[g.name] ?? ""}
                        onChange={(e) => setBudgets({ ...budgets, [g.name]: e.target.value })}
                        className="w-32 text-right"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </StepShell>
        )}

        {error && <p className="text-sm text-attention mt-4">{error}</p>}

        <div className="flex items-center justify-between mt-8">
          <div>
            {step > 0 && (
              <Button variant="quiet" onClick={back} disabled={busy}>
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {OPTIONAL_STEPS.includes(step) && (
              <Button variant="ghost" onClick={step === STEPS.length - 1 ? finish : next} disabled={busy}>
                Skip
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button onClick={next} disabled={busy}>
                Continue
              </Button>
            ) : (
              <Button onClick={finish} disabled={busy}>
                {busy ? "Setting up…" : "Finish"}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function StepShell({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-serif text-2xl text-ink">{title}</h1>
      <p className="text-muted mt-2 mb-6">{blurb}</p>
      {children}
    </div>
  );
}

function upd<T>(list: T[], i: number, patch: Partial<T>): T[] {
  return list.map((item, idx) => (idx === i ? { ...item, ...patch } : item));
}
