/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- App Constants ---
const CURRENT_DATE = new Date('2025-09-05T12:00:00Z'); // Use a specific time in UTC to avoid timezone issues
const CURRENT_DATE_ISO = CURRENT_DATE.toISOString().split('T')[0];

// --- Data Structures ---
interface Account { name: string; type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'; }
interface JournalEntry { account: string; debit?: number; credit?: number; }
interface Project { id: number; name: string; }
interface Transaction {
  id: number; vendor: string; amount: number; currency: string; date: string; category: string;
  transactionType: 'income' | 'expense'; journal: JournalEntry[]; reconciled?: boolean;
  projectId?: number; deductible?: boolean; miles?: number; classification: 'business' | 'personal';
}
interface BankStatementEntry { date: string; description: string; amount: number; }
interface ReconciliationResults { matched: Transaction[]; unmatchedLedger: Transaction[]; unmatchedBank: BankStatementEntry[]; }
interface Invoice {
  id: number; customer: string; invoiceNumber: string; invoiceDate: string; dueDate: string;
  amount: number; status: 'Draft' | 'Sent' | 'Paid'; relatedTransactionId: number; taxable?: boolean;
}
interface Bill {
  id: number; vendor: string; billNumber: string; billDate: string; dueDate: string;
  amount: number; status: 'Open' | 'Paid'; relatedTransactionId: number;
}
interface RecurringTransaction {
  id: number; description: string; frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  startDate: string; nextDueDate: string; details: Omit<Transaction, 'id' | 'date' | 'reconciled'>;
}
interface QuarterlyPayments { q1: number; q2: number; q3: number; q4: number; }
interface FinancialSummary {
  income: number; expenses: number; accountTotals: Record<string, number>; deductibleExpenses: number;
  miles: number; taxableSales: number; net: number; mileageDeduction: number; netProfitForTax: number;
}
interface TaxData {
  totalTaxOnYTDProfit: number; estimatedSalesTax: number; currentQuarter: number;
  cumulativeProfitForTax: number; paymentsMadeSoFar: number; currentQuarterPaymentDue: number;
  profitUpToCurrentQuarter: number; taxDueUpToCurrentQuarter: number;
}
interface Financials {
  q1: FinancialSummary; q2: FinancialSummary; q3: FinancialSummary; q4: FinancialSummary;
  ytd: FinancialSummary; tax: TaxData;
}
type AgingData = { current: number; '1-30': number; '31-60': number; '61-90': number; '90+': number; total: number; };
type ActiveTab = 'home' | 'transactions' | 'ar' | 'ap' | 'recurring' | 'journal' | 'coa' | 'projects' | 'tax';
type SearchResults = {
    transactions: Transaction[];
    invoices: Invoice[];
    bills: Bill[];
    projects: Project[];
} | null;
type AuthState = 'loggedOut' | 'loggingIn' | 'loggedIn';


// --- Default Data ---
const initialChartOfAccounts: Account[] = [
    // Assets
    { name: 'Bank', type: 'Asset' },
    { name: 'Accounts Receivable', type: 'Asset' },
    { name: 'Prepaid Expenses', type: 'Asset' },
    // Liabilities
    { name: 'Accounts Payable', type: 'Liability' },
    { name: 'Credit Card', type: 'Liability' },
    { name: 'Sales Tax Payable', type: 'Liability' },
    // Equity
    { name: 'Owner\'s Equity', type: 'Equity' },
    // Revenue
    { name: 'Sales Revenue', type: 'Revenue' },
    { name: 'Service Income', type: 'Revenue' },
    { name: 'Other Income', type: 'Revenue' },
    // Expenses
    { name: 'Advertising & Marketing', type: 'Expense' },
    { name: 'Bank Fees', type: 'Expense' },
    { name: 'Cost of Goods Sold', type: 'Expense' },
    { name: 'Dues & Subscriptions', type: 'Expense' },
    { name: 'Insurance Expense', type: 'Expense' },
    { name: 'Legal & Professional Fees', type: 'Expense' },
    { name: 'Meals & Entertainment', type: 'Expense' },
    { name: 'Mileage Expense', type: 'Expense' },
    { name: 'Office Supplies', type: 'Expense' },
    { name: 'Rent Expense', type: 'Expense' },
    { name: 'Repairs & Maintenance', type: 'Expense' },
    { name: 'Software & Subscriptions', type: 'Expense' },
    { name: 'Travel Expense', type: 'Expense' },
    { name: 'Utilities', type: 'Expense' },
    { name: 'Miscellaneous Expense', type: 'Expense' },
];

// --- Auth Components ---
const LandingPage: React.FC<{ onLoginClick: () => void; onSignUpClick: () => void; }> = ({ onLoginClick, onSignUpClick }) => (
    <div className="landing-container">
        <header className="landing-header">
            <div className="logo">Clario.ai</div>
            <nav>
                <button className="btn-secondary" onClick={onLoginClick}>Log In</button>
                <button className="btn-primary" onClick={onSignUpClick}>Sign Up</button>
            </nav>
        </header>
        <main>
            <section className="hero-section">
                <h1>Bookkeeping with Simplicity, Clarity, and Flexibility.</h1>
                <p>Clario.ai uses AI to turn your complex financial data into a clear, manageable picture, so you can focus on what you do best.</p>
                <button className="btn-primary btn-large" onClick={onSignUpClick}>Get Started for Free</button>
            </section>
            <section className="features-section">
                <h2>Your Financial Headaches, Solved.</h2>
                <div className="feature-cards-grid">
                    <div className="feature-card">
                        <h3>The Time and Expertise Sink</h3>
                        <p>You lack the time, energy, or know-how for accurate bookkeeping. Clario’s AI processes transactions from natural language, saving you hours of manual data entry.</p>
                    </div>
                    <div className="feature-card">
                        <h3>The Compliance Cliff</h3>
                        <p>The complexities of multi-state and self-employment taxes are overwhelming. Our Tax Agent provides real-time estimates to keep you prepared and in control.</p>
                    </div>
                    <div className="feature-card">
                        <h3>The Cash Flow Choke</h3>
                        <p>Manually chasing client payments is a drain. With integrated A/R and A/P aging, you get an instant, clear view of your cash flow so you always know where you stand.</p>
                    </div>
                </div>
            </section>
        </main>
    </div>
);

const LoginPage: React.FC<{ onLogin: (email: string) => void }> = ({ onLogin }) => {
    const [email, setEmail] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (email) {
            onLogin(email);
        }
    };

    return (
        <div className="login-page">
            <div className="login-content card">
                <h1>Login to Clario.ai</h1>
                <p>Enter your email to access your dashboard.</p>
                <form onSubmit={handleSubmit}>
                    <div className="form-group full-width">
                        <label htmlFor="email">Email Address</label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </div>
                    <button className="btn-primary btn-large" type="submit">Log In</button>
                </form>
            </div>
        </div>
    );
};


// --- Bookkeeping App Component ---
const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>('loggedOut');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<Account[]>(initialChartOfAccounts);
  const [activeProjectId, setActiveProjectId] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [bankStatementData, setBankStatementData] = useState<string>('');
  const [reconciliationResults, setReconciliationResults] = useState<ReconciliationResults | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState<boolean>(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'q1' | 'q2' | 'q3' | 'q4' | 'ytd'>('ytd');
  const [isBillingOpen, setIsBillingOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');


  // State for Tax Agent
  const [seTaxRate, setSeTaxRate] = useState<number>(15.3);
  const [salesTaxRate, setSalesTaxRate] = useState<number>(7.0);
  const [irsMileageRate, setIrsMileageRate] = useState<number>(0.67); // 2024 rate
  const [taxQuestion, setTaxQuestion] = useState<string>('');
  const [taxAgentResponse, setTaxAgentResponse] = useState<string>('');
  const [isTaxAgentLoading, setIsTaxAgentLoading] = useState<boolean>(false);
  const [quarterlyPayments, setQuarterlyPayments] = useState<QuarterlyPayments>({ q1: 0, q2: 0, q3: 0, q4: 0 });

  const hasCheckedRecurring = useRef(false);

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

    useEffect(() => {
        // If one of the billing sub-pages is active, ensure the parent menu is open.
        if (['ar', 'ap', 'recurring'].includes(activeTab)) {
            setIsBillingOpen(true);
        }
    }, [activeTab]);

  // Effect to generate recurring transactions on load
    useEffect(() => {
        if (hasCheckedRecurring.current || recurringTransactions.length === 0) {
            return;
        }

        const today = CURRENT_DATE;
        today.setHours(0, 0, 0, 0); // Normalize to the start of the day for accurate comparison

        const newTransactions: Transaction[] = [];
        const updatedRecurring = recurringTransactions.map(rec => {
            let recurringCopy = { ...rec };
            let nextDueDate = new Date(recurringCopy.nextDueDate);
            nextDueDate.setHours(0, 0, 0, 0);

            // Keep generating transactions as long as the due date is in the past or today
            while (nextDueDate <= today) {
                const generatedTx: Transaction = {
                    ...recurringCopy.details,
                    id: Date.now() + Math.random(),
                    date: recurringCopy.nextDueDate, // Use the due date as the transaction date
                    reconciled: false,
                };
                newTransactions.push(generatedTx);

                // Calculate the next due date for the next iteration
                const currentDueDate = new Date(recurringCopy.nextDueDate);
                switch (recurringCopy.frequency) {
                    case 'daily': currentDueDate.setDate(currentDueDate.getDate() + 1); break;
                    case 'weekly': currentDueDate.setDate(currentDueDate.getDate() + 7); break;
                    case 'monthly': currentDueDate.setMonth(currentDueDate.getMonth() + 1); break;
                    case 'yearly': currentDueDate.setFullYear(currentDueDate.getFullYear() + 1); break;
                }
                recurringCopy.nextDueDate = currentDueDate.toISOString().split('T')[0];
                nextDueDate = new Date(recurringCopy.nextDueDate);
                nextDueDate.setHours(0,0,0,0);
            }
            return recurringCopy;
        });

        if (newTransactions.length > 0) {
            setTransactions(prev => [...newTransactions, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
            setRecurringTransactions(updatedRecurring);
        }

        hasCheckedRecurring.current = true; // Ensure this logic only runs once per session
    }, [recurringTransactions]);


  const handleProcessTransaction = async () => {
    if (!inputText.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    const selectedProject = projects.find(p => p.id === activeProjectId);
    const projectContext = selectedProject ? `This transaction is for the project named "${selectedProject.name}". ` : '';
    const accountList = chartOfAccounts.map(a => a.name).join(', ');

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `The current date is September 5, 2025. Assume this is 'today' for any transactions without a specified date. ${projectContext}From the text below, extract all financial transactions. For each transaction, provide a standard double-entry journal. Use ONLY accounts from the following Chart of Accounts for journal entries: [${accountList}]. For the 'category' field, you must use the exact name of the expense account debited in the journal. For example, a debit to 'Software & Subscriptions' means the category must be 'Software & Subscriptions'. If no specific expense account from the list fits the transaction, you must debit the 'Miscellaneous Expense' account and set the category to 'Miscellaneous Expense'. Mark common business expenses as 'deductible'. Crucially, classify each transaction as 'business' or 'personal'. Most transactions are 'business' unless they are obviously personal like 'groceries at Safeway'. Text: "${inputText}"`,
        config: {
          systemInstruction: "You are an expert bookkeeper for specialized professionals like lawyers, real estate agents, and contractors. You MUST use accounts from the provided Chart of Accounts for all journal entries. When you see a cash receipt from a customer, determine if it is new revenue or a settlement of Accounts Receivable. For example, 'received $2600 from customer X' should debit Bank and credit Accounts Receivable. When you see a bill from a vendor to be paid later, you must credit 'Accounts Payable'. Calculate totals if hours and rates are provided (e.g., '4 hours at $300/hr').",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    vendor: { type: Type.STRING, description: "Merchant, client, or source name (e.g., 'Home Depot', 'Client XYZ', 'Mileage')" },
                    amount: { type: Type.NUMBER, description: "Transaction amount" },
                    currency: { type: Type.STRING, description: "Currency code (e.g., USD, CNY)" },
                    date: { type: Type.STRING, description: "Date (YYYY-MM-DD), assume today if not mentioned" },
                    category: { type: Type.STRING, description: "A brief, human-readable category based on the expense account used (e.g., 'Software', 'Travel', 'Income')." },
                    transactionType: { type: Type.STRING, description: "Is this 'income' or 'expense'?" },
                    classification: { type: Type.STRING, description: "Classify as 'business' or 'personal'. Default to 'business' for typical business expenses." },
                    deductible: { type: Type.BOOLEAN, description: "Is this expense likely tax-deductible for a self-employed person? Default to true for business expenses."},
                    miles: { type: Type.NUMBER, description: "If the transaction is for mileage, specify the number of miles driven."},
                    journal: {
                        type: Type.ARRAY,
                        description: "The double-entry journal for the transaction.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                account: { type: Type.STRING, description: "The account name, chosen ONLY from the provided Chart of Accounts list." },
                                debit: { type: Type.NUMBER, description: "The debit amount." },
                                credit: { type: Type.NUMBER, description: "The credit amount." },
                            },
                             required: ["account"]
                        }
                    }
                },
                required: ["vendor", "amount", "category", "transactionType", "date", "currency", "journal", "classification"]
            }
          },
        },
      });

      const responseText = response.text?.trim();
      if (!responseText) {
          throw new Error("The AI returned an empty response. This could be due to content filtering or an unclear prompt.");
      }

      let parsedTransactions;
      try {
        parsedTransactions = JSON.parse(responseText) as Omit<Transaction, 'id'>[];
      } catch (parseError) {
        console.error("Failed to parse AI JSON response:", responseText, parseError);
        throw new Error("The AI returned data in an unexpected format. Please try rephrasing your input.");
      }

      const newTransactionsWithIds = parsedTransactions.map(t => ({...t, id: Date.now() + Math.random(), reconciled: false, projectId: activeProjectId, classification: t.classification || 'business' }));

      const newBills: Bill[] = [];
      const newInvoices: Invoice[] = [];

      newTransactionsWithIds.forEach(t => {
          const isBill = t.journal.some(j => j.account === 'Accounts Payable' && j.credit);
          const isInvoice = t.journal.some(j => j.account === 'Accounts Receivable' && j.debit);

          if (isBill) {
              const dueDate = new Date(t.date);
              dueDate.setDate(dueDate.getDate() + 30); // Assume Net 30 for due date
              newBills.push({
                  id: Date.now() + Math.random(),
                  vendor: t.vendor,
                  billNumber: `B-${Date.now()}`, // Simple unique bill number
                  billDate: t.date,
                  dueDate: dueDate.toISOString().split('T')[0],
                  amount: t.amount,
                  status: 'Open',
                  relatedTransactionId: t.id
              });
          }
          if (isInvoice) {
              const dueDate = new Date(t.date);
              dueDate.setDate(dueDate.getDate() + 30); // Assume Net 30
              newInvoices.push({
                  id: Date.now() + Math.random(),
                  customer: t.vendor,
                  invoiceNumber: `INV-${Date.now()}`,
                  invoiceDate: t.date,
                  dueDate: dueDate.toISOString().split('T')[0],
                  amount: t.amount,
                  status: 'Sent',
                  relatedTransactionId: t.id,
                  taxable: false, // Defaulting to false as AI doesn't provide this.
              });
          }
      });

      setTransactions(prev => [...newTransactionsWithIds, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      if (newBills.length > 0) {
        setBills(prev => [...newBills, ...prev]);
      }
      if (newInvoices.length > 0) {
        setInvoices(prev => [...newInvoices, ...prev]);
      }
      setInputText('');

    } catch (e: any) {
      console.error(e);
      let friendlyMessage = "An unexpected error occurred. Please try again.";
      if (e instanceof Error) {
          if (e.message.includes("API key")) {
              friendlyMessage = "There appears to be a configuration issue with the AI service.";
          } else {
              friendlyMessage = e.message;
          }
      }
      setError(`Failed to process transaction. ${friendlyMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTransaction = (id: number) => {
    if (window.confirm('Are you sure you want to delete this transaction?')) {
        setTransactions(prev => prev.filter(t => t.id !== id));
    }
  };

    const handleToggleTransactionClassification = (transactionId: number) => {
        setTransactions(prev =>
            prev.map(t =>
                t.id === transactionId
                    ? { ...t, classification: t.classification === 'business' ? 'personal' : 'business' }
                    : t
            )
        );
    };

  const handleOpenEditModal = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsEditModalOpen(true);
  };

  const handleUpdateTransaction = (updatedTransaction: Transaction) => {
    setTransactions(prev => prev.map(t => t.id === updatedTransaction.id ? updatedTransaction : t).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setIsEditModalOpen(false);
    setEditingTransaction(null);
  };

  const handleReconcile = () => {
      if (!bankStatementData.trim()) {
          alert("Please paste your bank statement data.");
          return;
      }

      const bankEntries: BankStatementEntry[] = bankStatementData.trim().split('\n').map(line => {
          const [date, description, amount] = line.split(',');
          return { date, description, amount: parseFloat(amount) };
      }).filter(entry => !isNaN(entry.amount));

      const ledgerTransactions = [...transactions];
      const matched: Transaction[] = [];
      const unmatchedLedger: Transaction[] = [];
      const unmatchedBank: BankStatementEntry[] = [];

      const bankEntriesCopy = [...bankEntries];

      ledgerTransactions.forEach(ledgerTx => {
          const amountToMatch = ledgerTx.transactionType === 'income' ? ledgerTx.amount : -ledgerTx.amount;
          const matchIndex = bankEntriesCopy.findIndex(bankTx => bankTx.amount === amountToMatch);

          if (matchIndex !== -1) {
              matched.push({...ledgerTx, reconciled: true});
              bankEntriesCopy.splice(matchIndex, 1);
          } else {
              unmatchedLedger.push(ledgerTx);
          }
      });

      setReconciliationResults({
          matched,
          unmatchedLedger,
          unmatchedBank: bankEntriesCopy
      });
  };

  const handleCreateInvoice = (invoiceData: Omit<Invoice, 'id' | 'status' | 'relatedTransactionId'>) => {
    const transactionId = Date.now() + Math.random();
    const newTransaction: Transaction = {
        id: transactionId,
        vendor: invoiceData.customer,
        amount: invoiceData.amount,
        currency: 'USD', // Assuming USD for now
        date: invoiceData.invoiceDate,
        category: 'Sales', // General category
        transactionType: 'income',
        classification: 'business',
        journal: [
            { account: 'Accounts Receivable', debit: invoiceData.amount },
            { account: 'Sales Revenue', credit: invoiceData.amount }
        ],
        reconciled: false
    };

    const newInvoice: Invoice = {
        ...invoiceData,
        id: Date.now() + Math.random(),
        status: 'Draft',
        relatedTransactionId: transactionId
    };

    setTransactions(prev => [newTransaction, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setInvoices(prev => [newInvoice, ...prev]);
    setIsInvoiceModalOpen(false);
  };

  const handleUpdateInvoiceStatus = (invoiceId: number, status: 'Sent' | 'Paid') => {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) return;

      if (status === 'Paid' && invoice.status !== 'Paid') {
          const settlementTransaction: Transaction = {
              id: Date.now() + Math.random(),
              vendor: invoice.customer,
              amount: invoice.amount,
              currency: 'USD',
              date: CURRENT_DATE_ISO, // Today's date
              category: 'Payment',
              transactionType: 'income',
              classification: 'business',
              journal: [
                  { account: 'Bank', debit: invoice.amount },
                  { account: 'Accounts Receivable', credit: invoice.amount }
              ],
              reconciled: false
          };
          setTransactions(prev => [settlementTransaction, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }

      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? {...inv, status} : inv));
  };

  const handleDeleteInvoice = (invoiceId: number) => {
    if (window.confirm('Are you sure you want to delete this invoice and its related transaction?')) {
        const invoiceToDelete = invoices.find(inv => inv.id === invoiceId);
        if (invoiceToDelete) {
            setTransactions(prev => prev.filter(t => t.id !== invoiceToDelete.relatedTransactionId));
            setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
        }
    }
  };

    const handleCreateBill = (billData: Omit<Bill, 'id' | 'status' | 'relatedTransactionId'>) => {
        const transactionId = Date.now() + Math.random();
        // Default to a generic expense account, user can edit later.
        const expenseAccount = 'Miscellaneous Expense';
        const newTransaction: Transaction = {
            id: transactionId,
            vendor: billData.vendor,
            amount: billData.amount,
            currency: 'USD',
            date: billData.billDate,
            category: 'Bill',
            transactionType: 'expense',
            classification: 'business',
            journal: [
                { account: expenseAccount, debit: billData.amount },
                { account: 'Accounts Payable', credit: billData.amount }
            ],
            reconciled: false
        };

        const newBill: Bill = {
            ...billData,
            id: Date.now() + Math.random(),
            status: 'Open',
            relatedTransactionId: transactionId
        };

        setTransactions(prev => [newTransaction, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setBills(prev => [newBill, ...prev]);
        setIsBillModalOpen(false);
    };

    const handleUpdateBillStatus = (billId: number, status: 'Paid') => {
        const bill = bills.find(b => b.id === billId);
        if (!bill || bill.status === 'Paid') return;

        if (status === 'Paid') {
            const paymentTransaction: Transaction = {
                id: Date.now() + Math.random(),
                vendor: bill.vendor,
                amount: bill.amount,
                currency: 'USD',
                date: CURRENT_DATE_ISO,
                category: 'Payment',
                transactionType: 'expense',
                classification: 'business',
                journal: [
                    { account: 'Accounts Payable', debit: bill.amount },
                    { account: 'Bank', credit: bill.amount }
                ],
                reconciled: false
            };
            setTransactions(prev => [paymentTransaction, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        }
        setBills(prev => prev.map(b => b.id === billId ? { ...b, status } : b));
    };

    const handleDeleteBill = (billId: number) => {
        if (window.confirm('Are you sure you want to delete this bill and its related transaction?')) {
            const billToDelete = bills.find(b => b.id !== billId);
            if (billToDelete) {
                setTransactions(prev => prev.filter(t => t.id !== billToDelete.relatedTransactionId));
                setBills(prev => prev.filter(b => b.id !== billId));
            }
        }
    };


  const handleAddProject = (projectName: string) => {
    if (projectName.trim()) {
        const newProject: Project = { id: Date.now(), name: projectName.trim() };
        setProjects(prev => [...prev, newProject]);
    }
  };

  const handleDeleteProject = (projectId: number) => {
    if (window.confirm('Are you sure you want to delete this project? This will not delete associated transactions.')) {
        setProjects(prev => prev.filter(p => p.id !== projectId));
    }
  };

  const handleAddRecurringTransaction = (newRecurring: Omit<RecurringTransaction, 'id'>) => {
      setRecurringTransactions(prev => [...prev, { ...newRecurring, id: Date.now() }]);
  };

  const handleDeleteRecurringTransaction = (id: number) => {
      if (window.confirm('Are you sure you want to delete this recurring transaction schedule?')) {
          setRecurringTransactions(prev => prev.filter(rt => rt.id !== id));
      }
  };

  const handleAddAccount = (account: Account) => {
    if (account.name.trim() && !chartOfAccounts.some(acc => acc.name.toLowerCase() === account.name.toLowerCase().trim())) {
        setChartOfAccounts(prev => [...prev, account].sort((a,b) => a.name.localeCompare(b.name)));
    } else {
        alert("Account name must be unique.");
    }
  };

    const getQuarter = (dateStr: string): 'q1' | 'q2' | 'q3' | 'q4' => {
        const month = new Date(dateStr).getMonth();
        if (month < 3) return 'q1';
        if (month < 6) return 'q2';
        if (month < 9) return 'q3';
        return 'q4';
    };

    const financials: Financials = useMemo(() => {
        const businessTransactions = transactions.filter(t => t.classification === 'business');
        const accountTypes = new Map(chartOfAccounts.map(a => [a.name, a.type]));

        const periods: Record<'q1' | 'q2' | 'q3' | 'q4', {
            income: number; expenses: number; accountTotals: Record<string, number>;
            deductibleExpenses: number; miles: number; taxableSales: number;
        }> = {
            q1: { income: 0, expenses: 0, accountTotals: {}, deductibleExpenses: 0, miles: 0, taxableSales: 0 },
            q2: { income: 0, expenses: 0, accountTotals: {}, deductibleExpenses: 0, miles: 0, taxableSales: 0 },
            q3: { income: 0, expenses: 0, accountTotals: {}, deductibleExpenses: 0, miles: 0, taxableSales: 0 },
            q4: { income: 0, expenses: 0, accountTotals: {}, deductibleExpenses: 0, miles: 0, taxableSales: 0 },
        };

        const revenueAccountTypes = new Set(chartOfAccounts.filter(a => a.type === 'Revenue').map(a => a.name));
        const expenseAccountTypes = new Set(chartOfAccounts.filter(a => a.type === 'Expense').map(a => a.name));

        businessTransactions.forEach(t => {
            const isPLTransaction = t.journal.some(j => {
                const type = accountTypes.get(j.account);
                return type === 'Revenue' || type === 'Expense';
            });
            if (!isPLTransaction) return;

            const quarter = getQuarter(t.date);

            t.journal.forEach(j => {
                if (j.credit && revenueAccountTypes.has(j.account)) {
                    periods[quarter].income += j.credit;
                }
                if (j.debit && expenseAccountTypes.has(j.account)) {
                    periods[quarter].expenses += j.debit;
                    periods[quarter].accountTotals[j.account] = (periods[quarter].accountTotals[j.account] || 0) + j.debit;
                }
            });

            if (t.transactionType === 'expense') {
              if (t.deductible) periods[quarter].deductibleExpenses += t.amount;
              if (t.miles) periods[quarter].miles += t.miles;
            }
        });

        invoices.forEach(inv => {
             if (inv.taxable) {
                const originalTx = businessTransactions.find(t => t.id === inv.relatedTransactionId);
                if (originalTx) {
                    const quarter = getQuarter(originalTx.date);
                    periods[quarter].taxableSales += inv.amount;
                }
            }
        });

        const ytd = { income: 0, expenses: 0, net: 0, accountTotals: {} as Record<string, number>, deductibleExpenses: 0, miles: 0, mileageDeduction: 0, taxableSales: 0, netProfitForTax: 0 };

        const quarters: ('q1' | 'q2' | 'q3' | 'q4')[] = ['q1', 'q2', 'q3', 'q4'];
        const quarterlyData = quarters.map(q => {
            const data = periods[q];
            const net = data.income - data.expenses;
            const mileageDeduction = data.miles * irsMileageRate;
            const netProfitForTax = net - mileageDeduction;

            ytd.income += data.income;
            ytd.expenses += data.expenses;
            ytd.deductibleExpenses += data.deductibleExpenses;
            ytd.miles += data.miles;
            ytd.taxableSales += data.taxableSales;
            Object.entries(data.accountTotals).forEach(([acc, amount]) => {
                ytd.accountTotals[acc] = (ytd.accountTotals[acc] || 0) + amount;
            });

            return { ...data, net, mileageDeduction, netProfitForTax };
        });

        ytd.net = ytd.income - ytd.expenses;
        ytd.mileageDeduction = ytd.miles * irsMileageRate;
        ytd.netProfitForTax = ytd.net - ytd.mileageDeduction;

        const result = {
            q1: quarterlyData[0],
            q2: quarterlyData[1],
            q3: quarterlyData[2],
            q4: quarterlyData[3],
            ytd: ytd,
        };

        const today = CURRENT_DATE;
        const currentQuarterIndex = Math.floor(today.getMonth() / 3);
        let profitUpToCurrentQuarter = 0;
        const quarterKeys: ('q1' | 'q2' | 'q3' | 'q4')[] = ['q1', 'q2', 'q3', 'q4'];
        for (let i = 0; i <= currentQuarterIndex; i++) {
            profitUpToCurrentQuarter += result[quarterKeys[i]].netProfitForTax;
        }

        const taxDueUpToCurrentQuarter = Math.max(0, (profitUpToCurrentQuarter * 0.9235) * (seTaxRate / 100));

        let paymentsMadeSoFar = 0;
        const quarterPaymentKeys: (keyof QuarterlyPayments)[] = ['q1', 'q2', 'q3', 'q4'];
        for (let i = 0; i < currentQuarterIndex; i++) {
            paymentsMadeSoFar += quarterlyPayments[quarterPaymentKeys[i]];
        }

        const currentQuarterPaymentDue = taxDueUpToCurrentQuarter - paymentsMadeSoFar;
        const totalTaxOnYTDProfit = Math.max(0, (result.ytd.netProfitForTax * 0.9235) * (seTaxRate / 100));
        const estimatedSalesTax = result.ytd.taxableSales * (salesTaxRate / 100);

        return {
            ...result,
            tax: {
                totalTaxOnYTDProfit,
                estimatedSalesTax,
                currentQuarter: currentQuarterIndex + 1,
                cumulativeProfitForTax: result.ytd.netProfitForTax,
                paymentsMadeSoFar,
                currentQuarterPaymentDue,
                profitUpToCurrentQuarter,
                taxDueUpToCurrentQuarter,
            }
        };
    }, [transactions, invoices, seTaxRate, salesTaxRate, irsMileageRate, quarterlyPayments, chartOfAccounts]);

    const handleAskTaxAgent = async () => {
        if (!taxQuestion.trim() || isTaxAgentLoading) return;

        setIsTaxAgentLoading(true);
        setTaxAgentResponse('');

        const financialContext = `
            Current Financial Summary (Year-to-Date):
            - Total Income: $${financials.ytd.income.toFixed(2)}
            - Total Expenses: $${financials.ytd.expenses.toFixed(2)}
            - Net Profit (for tax purposes): $${financials.ytd.netProfitForTax.toFixed(2)}
            - Total Deductible Expenses: $${financials.ytd.deductibleExpenses.toFixed(2)}
            - Calculated Mileage Deduction: $${financials.ytd.mileageDeduction.toFixed(2)}
            - Estimated YTD Self-Employment Tax Due: $${financials.tax.totalTaxOnYTDProfit.toFixed(2)}
            - Estimated Sales Tax Owed: $${financials.tax.estimatedSalesTax.toFixed(2)}

            User's Question: "${taxQuestion}"
        `;

        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: financialContext,
                config: {
                    systemInstruction: "You are a professional AI tax assistant for freelancers and self-employed professionals. Based *only* on the financial data provided, answer the user's question. Do not provide financial or legal advice. Keep answers concise, clear, and directly related to the data. Start your response with 'Based on your data...'.",
                },
            });
            setTaxAgentResponse(response.text);
        } catch (e) {
            console.error(e);
            setTaxAgentResponse("Sorry, I encountered an error while processing your request. Please try again.");
        } finally {
            setIsTaxAgentLoading(false);
            setTaxQuestion('');
        }
    };

    const getAgingData = (items: (Invoice[] | Bill[]), type: 'receivable' | 'payable'): AgingData => {
        const aging: AgingData = {
            current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0
        };

        const unpaidItems = items.filter(item => (type === 'receivable' ? (item as Invoice).status !== 'Paid' : (item as Bill).status !== 'Paid'));

        unpaidItems.forEach(item => {
            const daysOverdue = getDaysOverdue(item.dueDate);
            aging.total += item.amount;

            if (daysOverdue <= 0) {
                aging.current += item.amount;
            } else if (daysOverdue <= 30) {
                aging['1-30'] += item.amount;
            } else if (daysOverdue <= 60) {
                aging['31-60'] += item.amount;
            } else if (daysOverdue <= 90) {
                aging['61-90'] += item.amount;
            } else {
                aging['90+'] += item.amount;
            }
        });
        return aging;
    };

    const searchResults = useMemo(() => {
        if (searchQuery.length < 2) return null;
        const query = searchQuery.toLowerCase();
        
        const foundTransactions = transactions.filter(t => 
            t.vendor.toLowerCase().includes(query) || 
            t.category.toLowerCase().includes(query)
        ).slice(0, 5);
        
        const foundInvoices = invoices.filter(i => 
            i.customer.toLowerCase().includes(query) || 
            i.invoiceNumber.toLowerCase().includes(query)
        ).slice(0, 3);
        
        const foundBills = bills.filter(b => 
            b.vendor.toLowerCase().includes(query) || 
            b.billNumber.toLowerCase().includes(query)
        ).slice(0, 3);

        const foundProjects = projects.filter(p => 
            p.name.toLowerCase().includes(query)
        ).slice(0, 3);

        const hasResults = foundTransactions.length > 0 || foundInvoices.length > 0 || foundBills.length > 0 || foundProjects.length > 0;

        if (!hasResults) return null;

        return {
            transactions: foundTransactions,
            invoices: foundInvoices,
            bills: foundBills,
            projects: foundProjects,
        };
    }, [searchQuery, transactions, invoices, bills, projects]);

    const handleSearchResultClick = (tab: ActiveTab) => {
        setActiveTab(tab);
        setSearchQuery('');
    };

  const renderContent = () => {
    switch(activeTab) {
        case 'home':
            return <DashboardPLView
                financials={financials}
                selectedPeriod={selectedPeriod}
                setSelectedPeriod={setSelectedPeriod}
                projects={projects}
                transactions={transactions}
                invoices={invoices}
                bills={bills}
                getAgingData={getAgingData}
            />;
        case 'transactions':
            return <DashboardLogView
                transactions={transactions}
                inputText={inputText}
                setInputText={setInputText}
                isLoading={isLoading}
                activeProjectId={activeProjectId}
                setActiveProjectId={setActiveProjectId}
                projects={projects}
                handleProcessTransaction={handleProcessTransaction}
                error={error}
                bankStatementData={bankStatementData}
                setBankStatementData={setBankStatementData}
                handleReconcile={handleReconcile}
                reconciliationResults={reconciliationResults}
                handleOpenEditModal={handleOpenEditModal}
                handleDeleteTransaction={handleDeleteTransaction}
                handleToggleTransactionClassification={handleToggleTransactionClassification}
                chartOfAccounts={chartOfAccounts}
            />;
        case 'ar':
            return <ARView
                invoices={invoices}
                getAgingData={getAgingData}
                setIsInvoiceModalOpen={setIsInvoiceModalOpen}
                handleUpdateInvoiceStatus={handleUpdateInvoiceStatus}
                handleDeleteInvoice={handleDeleteInvoice}
            />;
        case 'ap':
            return <APView
                bills={bills}
                getAgingData={getAgingData}
                setIsBillModalOpen={setIsBillModalOpen}
                handleUpdateBillStatus={handleUpdateBillStatus}
                handleDeleteBill={handleDeleteBill}
            />;
        case 'projects':
            return <ProjectsView
                projects={projects}
                handleAddProject={handleAddProject}
                handleDeleteProject={handleDeleteProject}
            />;
        case 'tax':
            return <TaxAgentView
                financials={financials}
                quarterlyPayments={quarterlyPayments}
                setQuarterlyPayments={setQuarterlyPayments}
                seTaxRate={seTaxRate}
                setSeTaxRate={setSeTaxRate}
                salesTaxRate={salesTaxRate}
                setSalesTaxRate={setSalesTaxRate}
                irsMileageRate={irsMileageRate}
                setIrsMileageRate={setIrsMileageRate}
                taxQuestion={taxQuestion}
                setTaxQuestion={setTaxQuestion}
                handleAskTaxAgent={handleAskTaxAgent}
                isTaxAgentLoading={isTaxAgentLoading}
                taxAgentResponse={taxAgentResponse}
            />;
        case 'recurring':
            return <RecurringView
                recurringTransactions={recurringTransactions}
                handleAddRecurringTransaction={handleAddRecurringTransaction}
                handleDeleteRecurringTransaction={handleDeleteRecurringTransaction}
            />;
        case 'journal':
            return <JournalView transactions={transactions} />;
        case 'coa':
            return <COAView chartOfAccounts={chartOfAccounts} onAddAccount={handleAddAccount} />;
        default:
            return null;
    }
  }

  const handleLogin = (email: string) => {
      setUserEmail(email);
      setAuthState('loggedIn');
  };

  const handleLogout = () => {
      setUserEmail(null);
      setAuthState('loggedOut');
  };

  if (authState === 'loggedOut') {
      return <LandingPage onLoginClick={() => setAuthState('loggingIn')} onSignUpClick={() => setAuthState('loggingIn')} />;
  }

  if (authState === 'loggingIn') {
      return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="app-layout">
        <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isBillingOpen={isBillingOpen}
            setIsBillingOpen={setIsBillingOpen}
        />
       <div className="main-wrapper">
            <Header
              userEmail={userEmail}
              onLogout={handleLogout}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
            {searchResults && <SearchResultsDropdown results={searchResults} onResultClick={handleSearchResultClick} />}
             <main className="main-content">
                {renderContent()}
            </main>
       </div>

       {isEditModalOpen && editingTransaction && (
            <EditTransactionModal
                transaction={editingTransaction}
                onClose={() => setIsEditModalOpen(false)}
                onUpdate={handleUpdateTransaction}
                chartOfAccounts={chartOfAccounts}
            />
        )}
        {isInvoiceModalOpen && <InvoiceModal onClose={() => setIsInvoiceModalOpen(false)} onCreate={handleCreateInvoice} />}
        {isBillModalOpen && <BillModal onClose={() => setIsBillModalOpen(false)} onCreate={handleCreateBill} />}
    </div>
  );
};

// --- Icons ---
const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const TransactionsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><line x1="17" x2="7" y1="7" y2="7"/><line x1="17" x2="7" y1="17" y2="17"/></svg>;
const BillingIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M2 8h20"/><path d="M6 12h4"/></svg>;
const JournalIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>;
const ChartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>;
const ProjectsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>;
const TaxIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.21 15.89-1.21-1.21a2 2 0 0 0-2.83 0l-1.18 1.18a2 2 0 0 1-2.83 0l-2.24-2.24a2 2 0 0 1 0-2.83l1.18-1.18a2 2 0 0 0 0-2.83l-1.21-1.21a2 2 0 0 0-2.83 0L2.1 12.89a2 2 0 0 0 0 2.83l8.49 8.48a2 2 0 0 0 2.83 0l8.48-8.48a2 2 0 0 0 0-2.83z"/><path d="M5.7 14.3 2.1 10.7a2 2 0 0 1 0-2.83l5.66-5.66a2 2 0 0 1 2.83 0l5.66 5.66a2 2 0 0 1 0 2.83l-5.66 5.66a2 2 0 0 1-2.83 0z"/></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
const ChevronDownIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>;

// --- Layout Components ---
const Sidebar: React.FC<{
    activeTab: ActiveTab,
    setActiveTab: (tab: ActiveTab) => void,
    isBillingOpen: boolean,
    setIsBillingOpen: (isOpen: boolean) => void
}> = ({ activeTab, setActiveTab, isBillingOpen, setIsBillingOpen }) => {
    const isBillingActive = ['ar', 'ap', 'recurring'].includes(activeTab);

    return (
        <aside className="sidebar">
            <div className="sidebar-header">Clario.ai</div>
            <nav className="sidebar-nav">
                <ul>
                    <li><a href="#" className={activeTab === 'home' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('home'); }}><HomeIcon /> Home</a></li>
                    <li><a href="#" className={activeTab === 'transactions' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('transactions'); }}><TransactionsIcon /> Transactions</a></li>
                    <li>
                        <a href="#" className={isBillingActive ? 'active' : ''} onClick={(e) => { e.preventDefault(); setIsBillingOpen(!isBillingOpen); }}>
                            <BillingIcon /> Billing
                            <span className={`chevron ${isBillingOpen ? 'open' : ''}`}><ChevronDownIcon /></span>
                        </a>
                         {isBillingOpen && (
                            <ul className="sub-menu">
                                <li><a href="#" className={activeTab === 'ar' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('ar'); }}>A/R</a></li>
                                <li><a href="#" className={activeTab === 'ap' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('ap'); }}>A/P</a></li>
                                <li><a href="#" className={activeTab === 'recurring' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('recurring'); }}>Recurring</a></li>
                            </ul>
                         )}
                    </li>
                    <li><a href="#" className={activeTab === 'journal' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('journal'); }}><JournalIcon /> Journal</a></li>
                    <li><a href="#" className={activeTab === 'coa' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('coa'); }}><ChartIcon /> Chart of Accounts</a></li>
                    <li><a href="#" className={activeTab === 'projects' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('projects'); }}><ProjectsIcon /> Projects</a></li>
                    <li><a href="#" className={activeTab === 'tax' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('tax'); }}><TaxIcon /> Tax Agent</a></li>
                </ul>
            </nav>
        </aside>
    );
};

const Header: React.FC<{ userEmail: string | null; onLogout: () => void; searchQuery: string; setSearchQuery: (q: string) => void; }> = ({ userEmail, onLogout, searchQuery, setSearchQuery }) => (
    <header className="main-header">
        <div className="search-bar">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search transactions, invoices, projects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
        </div>
        <div className="user-info">
            <span>{userEmail}</span>
            <button onClick={onLogout}>Log Out</button>
        </div>
    </header>
);

const SearchResultsDropdown: React.FC<{ results: NonNullable<SearchResults>, onResultClick: (tab: ActiveTab) => void }> = ({ results, onResultClick }) => {
    const renderLink = (tab: ActiveTab, key: string | number, text: string) => (
        <a href="#" key={key} className="search-result-item" onClick={(e) => { e.preventDefault(); onResultClick(tab); }}>
            {text}
        </a>
    );

    return (
        <div className="search-results-dropdown">
            {results.transactions.length > 0 && (
                <div className="search-result-group">
                    <h4>Transactions</h4>
                    {results.transactions.map(t => renderLink('transactions', t.id, `${t.vendor} - $${t.amount.toFixed(2)} on ${t.date}`))}
                </div>
            )}
            {results.invoices.length > 0 && (
                <div className="search-result-group">
                    <h4>Invoices (A/R)</h4>
                    {results.invoices.map(i => renderLink('ar', i.id, `Inv #${i.invoiceNumber} to ${i.customer} for $${i.amount.toFixed(2)}`))}
                </div>
            )}
            {results.bills.length > 0 && (
                <div className="search-result-group">
                    <h4>Bills (A/P)</h4>
                    {results.bills.map(b => renderLink('ap', b.id, `Bill #${b.billNumber} from ${b.vendor} for $${b.amount.toFixed(2)}`))}
                </div>
            )}
            {results.projects.length > 0 && (
                <div className="search-result-group">
                    <h4>Projects</h4>
                    {results.projects.map(p => renderLink('projects', p.id, p.name))}
                </div>
            )}
        </div>
    );
};


// --- Child Components (Refactored to be outside App) ---

const DashboardLogView: React.FC<{
    transactions: Transaction[],
    inputText: string,
    setInputText: (text: string) => void,
    isLoading: boolean,
    activeProjectId: number | undefined,
    setActiveProjectId: (id: number | undefined) => void,
    projects: Project[],
    handleProcessTransaction: () => void,
    error: string | null,
    bankStatementData: string,
    setBankStatementData: (data: string) => void,
    handleReconcile: () => void,
    reconciliationResults: ReconciliationResults | null,
    handleOpenEditModal: (t: Transaction) => void,
    handleDeleteTransaction: (id: number) => void,
    handleToggleTransactionClassification: (id: number) => void,
    chartOfAccounts: Account[]
}> = ({
    transactions, inputText, setInputText, isLoading, activeProjectId, setActiveProjectId, projects,
    handleProcessTransaction, error, bankStatementData, setBankStatementData, handleReconcile,
    reconciliationResults, handleOpenEditModal, handleDeleteTransaction, handleToggleTransactionClassification, chartOfAccounts
}) => {
    const [filterClassification, setFilterClassification] = useState<'all' | 'business' | 'personal'>('business');
    const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
    const [filterAccount, setFilterAccount] = useState<string>('all');
    const [filterStartDate, setFilterStartDate] = useState<string>('');
    const [filterEndDate, setFilterEndDate] = useState<string>('');

    const accountsForFilter = useMemo(() => {
        return chartOfAccounts
            .filter(a => a.type === 'Revenue' || a.type === 'Expense')
            .map(a => a.name)
            .sort();
    }, [chartOfAccounts]);

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            if (filterClassification !== 'all' && t.classification !== filterClassification) {
                return false;
            }
            if (filterType !== 'all' && t.transactionType !== filterType) {
                return false;
            }
            if (filterAccount !== 'all' && !t.journal.some(j => j.account === filterAccount)) {
                return false;
            }
            if (filterStartDate && new Date(t.date) < new Date(filterStartDate)) {
                return false;
            }
            if (filterEndDate) {
                const endDate = new Date(filterEndDate);
                endDate.setDate(endDate.getDate() + 1);
                if (new Date(t.date) >= endDate) {
                    return false;
                }
            }
            return true;
        });
    }, [transactions, filterClassification, filterType, filterAccount, filterStartDate, filterEndDate]);

    const resetFilters = () => {
        setFilterClassification('business');
        setFilterType('all');
        setFilterAccount('all');
        setFilterStartDate('');
        setFilterEndDate('');
    };

    return (
    <div className="dashboard-grid">
        <section className="input-section card">
            <h2>New Transaction</h2>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="e.g., Bought $500 of lumber... or... drove 50 miles for showings..."
                disabled={isLoading}
                aria-label="Transaction Input"
              />
              <div className="form-group">
                <label htmlFor="project-select">Assign to Project (Optional)</label>
                <select
                    id="project-select"
                    value={activeProjectId ?? ''}
                    onChange={e => setActiveProjectId(e.target.value ? Number(e.target.value) : undefined)}
                >
                    <option value="">None</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="button-group">
                <button
                  className="submit-button"
                  onClick={handleProcessTransaction}
                  disabled={isLoading || !inputText.trim()}
                  aria-live="polite"
                >
                  {isLoading ? <span className="loader" /> : 'Process Transaction'}
                </button>
              </div>
              {error && <div className="error-message" role="alert">{error}</div>}
               <div className="advanced-features">
                  <h4>Bank Reconciliation</h4>
                  <p>Paste bank statement CSV data (Date,Description,Amount) to match against your ledger.</p>
                  <textarea
                    value={bankStatementData}
                    onChange={(e) => setBankStatementData(e.target.value)}
                    placeholder="2024-05-20,Figma Subscription,-120.00&#10;2024-05-21,Client Payment,2600.00"
                    aria-label="Bank Statement Input"
                  />
                  <button className="submit-button" onClick={handleReconcile}>Run Reconciliation</button>
              </div>
        </section>
        <section className="log-section-container card">
            <div className="log-header">
              <h2>Transaction Log</h2>
               <div className="filter-section">
                    <div className="form-group">
                        <label>Classification</label>
                        <select value={filterClassification} onChange={e => setFilterClassification(e.target.value as any)}>
                            <option value="business">Business</option>
                            <option value="personal">Personal</option>
                            <option value="all">All</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Type</label>
                        <select value={filterType} onChange={e => setFilterType(e.target.value as any)}>
                            <option value="all">All</option>
                            <option value="income">Income</option>
                            <option value="expense">Expense</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Account</label>
                        <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
                            <option value="all">All Accounts</option>
                            {accountsForFilter.map(acc => <option key={acc} value={acc}>{acc}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Start Date</label>
                        <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>End Date</label>
                        <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
                    </div>
                    <button className="reset-filters" onClick={resetFilters}>Reset</button>
                </div>
            </div>
            <div className="log-section">
                {reconciliationResults && <ReconciliationView results={reconciliationResults} />}
                {filteredTransactions.length > 0 ? (
                    <div className="transaction-list">
                      {filteredTransactions.map(t => (
                        <TransactionCard key={t.id} transaction={t} onEdit={handleOpenEditModal} onDelete={handleDeleteTransaction} onToggleClassification={handleToggleTransactionClassification} projects={projects} />
                      ))}
                    </div>
                  ) : (
                    <div className="empty-log"><p>No transactions match your filters.</p></div>
                )}
            </div>
        </section>
    </div>
    )
};

const CashFlowSummaryView = ({ data }: { data: { currentCashBalance: number; totalReceivables: number; totalPayables: number; projectedCashBalance: number; } }) => (
    <section className="cash-flow-summary card">
        <h3>Cash Flow Summary</h3>
        <div className="cash-flow-line">
            <span>Current Cash Balance</span>
            <span className="cash-flow-amount">${data.currentCashBalance.toFixed(2)}</span>
        </div>
        <div className="cash-flow-line detail">
            <span>+ Upcoming A/R</span>
            <span className="cash-flow-amount income">${data.totalReceivables.toFixed(2)}</span>
        </div>
        <div className="cash-flow-line detail">
            <span>- Upcoming A/P</span>
            <span className="cash-flow-amount expense">-${data.totalPayables.toFixed(2)}</span>
        </div>
        <div className="cash-flow-line total">
            <span>Projected Cash Balance</span>
            <span className={`cash-flow-amount ${data.projectedCashBalance >= 0 ? '' : 'expense'}`}>${data.projectedCashBalance.toFixed(2)}</span>
        </div>
    </section>
);

const DashboardPLView: React.FC<{
    financials: Financials,
    selectedPeriod: 'q1' | 'q2' | 'q3' | 'q4' | 'ytd',
    setSelectedPeriod: (period: 'q1' | 'q2' | 'q3' | 'q4' | 'ytd') => void,
    projects: Project[],
    transactions: Transaction[],
    invoices: Invoice[],
    bills: Bill[],
    getAgingData: (items: (Invoice[] | Bill[]), type: 'receivable' | 'payable') => AgingData
}> = ({ financials, selectedPeriod, setSelectedPeriod, projects, transactions, invoices, bills, getAgingData }) => {
    const dataForPeriod = financials[selectedPeriod];
    if (!dataForPeriod) return null;

    const totalExpenses = dataForPeriod.expenses;
    const expenseAccounts = Object.entries(dataForPeriod.accountTotals)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    const projectFinancials = useMemo(() => {
        const businessTransactions = transactions.filter(t => t.classification === 'business');
        const projectsData: Record<number, { name: string; income: number; expenses: number }> = {};
        projects.forEach(p => {
            projectsData[p.id] = { name: p.name, income: 0, expenses: 0 };
        });

        businessTransactions.forEach(t => {
            if (t.projectId && projectsData[t.projectId]) {
                const isSettlement = t.journal.some(j => j.account === 'Accounts Receivable' || j.account === 'Accounts Payable');
                if (isSettlement) return;

                if (t.transactionType === 'income') {
                    projectsData[t.projectId].income += t.amount;
                } else if (t.transactionType === 'expense') {
                    projectsData[t.projectId].expenses += t.amount;
                }
            }
        });
        return Object.values(projectsData);
    }, [transactions, projects]);

    const cashFlowData = useMemo(() => {
        const currentCashBalance = transactions.reduce((acc, t) => {
            const bankJournalEntry = t.journal.find(j => j.account === 'Bank');
            if (bankJournalEntry) {
                if (bankJournalEntry.debit) return acc + bankJournalEntry.debit;
                if (bankJournalEntry.credit) return acc - bankJournalEntry.credit;
            }
            return acc;
        }, 0);

        const totalReceivables = getAgingData(invoices, 'receivable').total;
        const totalPayables = getAgingData(bills, 'payable').total;
        const projectedCashBalance = currentCashBalance + totalReceivables - totalPayables;

        return { currentCashBalance, totalReceivables, totalPayables, projectedCashBalance };
    }, [transactions, invoices, bills, getAgingData]);

    return (
        <div className="dashboard-pl-view">
            <div className="stat-card-grid">
                <div className="stat-card">
                    <div className="label">YTD Total Income</div>
                    <div className="value income">${financials.ytd.income.toFixed(2)}</div>
                </div>
                <div className="stat-card">
                    <div className="label">YTD Total Expenses</div>
                    <div className="value expense">${financials.ytd.expenses.toFixed(2)}</div>
                </div>
                <div className="stat-card">
                    <div className="label">YTD Net Profit</div>
                    <div className="value">${financials.ytd.net.toFixed(2)}</div>
                </div>
            </div>

            <CashFlowSummaryView data={cashFlowData} />

            <section className="pnl-statement card">
                <div className="pnl-title-bar">
                    <h3>Profit & Loss Statement</h3>
                    <div className="period-selector">
                        {(['q1', 'q2', 'q3', 'q4', 'ytd'] as const).map(p => (
                            <button key={p} className={selectedPeriod === p ? 'active' : ''} onClick={() => setSelectedPeriod(p)}>
                                {p.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="pnl-section">
                    <span>Income</span>
                    <div className="pnl-line"><span>Total Income</span><span className="pnl-amount income">${dataForPeriod.income.toFixed(2)}</span></div>
                </div>
                 <div className="pnl-section">
                    <span>Expenses</span>
                     {expenseAccounts.length > 0 ? (
                         expenseAccounts.map(acc => (
                             <div className="pnl-line detail" key={acc.name}><span>{acc.name}</span><span className="pnl-amount expense">-${acc.value.toFixed(2)}</span></div>
                         ))
                     ) : <div className="pnl-line detail"><span>No expenses this period.</span><span></span></div>}
                    <div className="pnl-line total"><span>Total Expenses</span><span className="pnl-amount expense">-${dataForPeriod.expenses.toFixed(2)}</span></div>
                </div>
                <div className="pnl-line net-profit"><span>Net Profit</span><span className="pnl-amount">${dataForPeriod.net.toFixed(2)}</span></div>
            </section>
            
            <div className="expense-analysis-container card">
                <h3>Expense Analysis (YTD)</h3>
                {expenseAccounts.length > 0 ? (
                    <ul>
                        {expenseAccounts.map(acc => (
                            <li key={acc.name}>
                                <div className="category-info">
                                    <span>{acc.name}</span>
                                    <span>${acc.value.toFixed(2)}</span>
                                </div>
                                <div className="category-bar-container">
                                    <div className="category-bar" style={{ width: `${totalExpenses > 0 ? (acc.value / totalExpenses) * 100 : 0}%` }}></div>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : <div className="no-data"><p>No expense data for this period.</p></div>}
            </div>
            
            <section className="project-summary card">
                <h3>Project Profitability (YTD)</h3>
                 {projectFinancials.length > 0 ? (
                    <>
                        <div className="pnl-header project-summary-header">
                            <span>Project Name</span>
                            <span className="pnl-amount">Income</span>
                            <span className="pnl-amount">Expenses</span>
                            <span className="pnl-amount">Net Profit</span>
                        </div>
                        {projectFinancials.map(p => (
                            <div className="pnl-line project-line" key={p.name}>
                                <span>{p.name}</span>
                                <span className="pnl-amount income">${p.income.toFixed(2)}</span>
                                <span className="pnl-amount expense">-${p.expenses.toFixed(2)}</span>
                                <span className="pnl-amount">${(p.income - p.expenses).toFixed(2)}</span>
                            </div>
                        ))}
                    </>
                ) : (
                    <div className="no-data"><p>No projects with financial data.</p></div>
                )}
            </section>
        </div>
    );
};

const AgingReportView = ({ data, title }: { data: AgingData, title: string }) => (
    <div className="aging-summary">
        <h2>{title}</h2>
        <div className="stat-card-grid">
            <div className="stat-card">
                <div className="label">Current</div>
                <div className="value">${data.current.toFixed(2)}</div>
            </div>
            <div className="stat-card">
                <div className="label">1-30 Days Overdue</div>
                <div className="value warning">${data['1-30'].toFixed(2)}</div>
            </div>
            <div className="stat-card">
                <div className="label">31-60 Days Overdue</div>
                <div className="value expense">${data['31-60'].toFixed(2)}</div>
            </div>
            <div className="stat-card">
                <div className="label">61-90 Days Overdue</div>
                <div className="value expense">${data['61-90'].toFixed(2)}</div>
            </div>
            <div className="stat-card">
                <div className="label">90+ Days Overdue</div>
                <div className="value expense">${data['90+'].toFixed(2)}</div>
            </div>
            <div className="stat-card">
                <div className="label">Total Outstanding</div>
                <div className="value">${data.total.toFixed(2)}</div>
            </div>
        </div>
    </div>
);

const ARView: React.FC<{
    invoices: Invoice[],
    getAgingData: (items: (Invoice[] | Bill[]), type: 'receivable' | 'payable') => AgingData,
    setIsInvoiceModalOpen: (isOpen: boolean) => void,
    handleUpdateInvoiceStatus: (id: number, status: 'Sent' | 'Paid') => void,
    handleDeleteInvoice: (id: number) => void
}> = ({ invoices, getAgingData, setIsInvoiceModalOpen, handleUpdateInvoiceStatus, handleDeleteInvoice }) => {
    const arAgingData = useMemo(() => getAgingData(invoices, 'receivable'), [invoices, getAgingData]);
    const sortedInvoices = useMemo(() => [...invoices].sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()), [invoices]);
    return (
        <div className="card">
            <div className="module-header">
                <h1>Accounts Receivable</h1>
                <button className="btn-primary" onClick={() => setIsInvoiceModalOpen(true)}>New Invoice</button>
            </div>
            <AgingReportView data={arAgingData} title="A/R Aging Summary" />
            <div className="item-list">
                {sortedInvoices.length > 0 ? (
                    sortedInvoices.map(invoice => <InvoiceCard key={invoice.id} invoice={invoice} onUpdateStatus={handleUpdateInvoiceStatus} onDelete={handleDeleteInvoice} />)
                ) : (
                    <div className="no-data"><p>No invoices found.</p></div>
                )}
            </div>
        </div>
    );
};

const APView: React.FC<{
    bills: Bill[],
    getAgingData: (items: (Invoice[] | Bill[]), type: 'receivable' | 'payable') => AgingData,
    setIsBillModalOpen: (isOpen: boolean) => void,
    handleUpdateBillStatus: (id: number, status: 'Paid') => void,
    handleDeleteBill: (id: number) => void
}> = ({ bills, getAgingData, setIsBillModalOpen, handleUpdateBillStatus, handleDeleteBill }) => {
    const apAgingData = useMemo(() => getAgingData(bills, 'payable'), [bills, getAgingData]);
    const sortedBills = useMemo(() => [...bills].sort((a, b) => new Date(b.billDate).getTime() - new Date(a.billDate).getTime()), [bills]);
    return (
        <div className="card">
            <div className="module-header">
                <h1>Accounts Payable</h1>
                <button className="btn-primary" onClick={() => setIsBillModalOpen(true)}>New Bill</button>
            </div>
            <AgingReportView data={apAgingData} title="A/P Aging Summary" />
            <div className="item-list">
                 {sortedBills.length > 0 ? (
                    sortedBills.map(bill => <BillCard key={bill.id} bill={bill} onUpdateStatus={handleUpdateBillStatus} onDelete={handleDeleteBill} />)
                ) : (
                    <div className="no-data"><p>No bills found.</p></div>
                )}
            </div>
        </div>
    )
};

const ProjectsView: React.FC<{
    projects: Project[],
    handleAddProject: (name: string) => void,
    handleDeleteProject: (id: number) => void
}> = ({ projects, handleAddProject, handleDeleteProject }) => {
    const [newProjectName, setNewProjectName] = useState('');

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        handleAddProject(newProjectName);
        setNewProjectName('');
    }

    return (
        <div className="card">
            <div className="module-header">
                <h1>Projects</h1>
            </div>
            <form onSubmit={handleAdd} className="add-project-form">
                <div className="project-input-wrapper">
                    <ProjectsIcon />
                    <input
                        type="text"
                        value={newProjectName}
                        onChange={e => setNewProjectName(e.target.value)}
                        placeholder="Enter new project name..."
                    />
                </div>
                <button type="submit" className="btn-primary">Add Project</button>
            </form>
            <div className="item-list">
                 {projects.length > 0 ? (
                    projects.map(p => (
                        <div key={p.id} className="project-card">
                            <span>{p.name}</span>
                            <button onClick={() => handleDeleteProject(p.id)} className="delete-btn" aria-label={`Delete project ${p.name}`}>&times;</button>
                        </div>
                    ))
                 ) : (
                    <div className="no-data"><p>No projects created yet.</p></div>
                 )}
            </div>
        </div>
    );
};

const TaxAgentView: React.FC<{
    financials: Financials,
    quarterlyPayments: QuarterlyPayments,
    setQuarterlyPayments: (p: React.SetStateAction<QuarterlyPayments>) => void,
    seTaxRate: number,
    setSeTaxRate: (r: number) => void,
    salesTaxRate: number,
    setSalesTaxRate: (r: number) => void,
    irsMileageRate: number,
    setIrsMileageRate: (r: number) => void,
    taxQuestion: string,
    setTaxQuestion: (q: string) => void,
    handleAskTaxAgent: () => void,
    isTaxAgentLoading: boolean,
    taxAgentResponse: string
}> = ({
    financials, quarterlyPayments, setQuarterlyPayments, seTaxRate, setSeTaxRate, salesTaxRate, setSalesTaxRate,
    irsMileageRate, setIrsMileageRate, taxQuestion, setTaxQuestion, handleAskTaxAgent, isTaxAgentLoading, taxAgentResponse
}) => {
    const { tax } = financials;
    const paymentDueText = tax.currentQuarterPaymentDue >= 0 ? "Est. Payment Due" : "Est. Overpayment / Refund";
    const paymentDueClass = tax.currentQuarterPaymentDue >= 0 ? "warning" : "income";

    return (
         <div className="card">
            <div className="module-header">
                <h1>Tax Agent</h1>
            </div>
            <p className="disclaimer">
                This is an AI-powered tool for estimation purposes only. It is not financial advice. Please consult with a qualified tax professional.
            </p>
            <div className="stat-card-grid">
                <div className="stat-card">
                    <div className="label">
                        {paymentDueText} (Q{tax.currentQuarter})
                        <Tooltip
                            text={
                                <div className="tax-breakdown">
                                    <h4>Q{tax.currentQuarter} Tax Calculation</h4>
                                    <div className="breakdown-section">
                                        <h5>Cumulative Profit</h5>
                                        <div className="breakdown-line"><span>Profit up to Q{tax.currentQuarter}</span> <span>${tax.profitUpToCurrentQuarter.toFixed(2)}</span></div>
                                        <div className="breakdown-line total"><span>Total Est. Tax Due YTD</span> <span>${tax.taxDueUpToCurrentQuarter.toFixed(2)}</span></div>
                                    </div>
                                    <div className="breakdown-section">
                                        <h5>Payments</h5>
                                        <div className="breakdown-line"><span>Payments made before Q{tax.currentQuarter}</span> <span>-${tax.paymentsMadeSoFar.toFixed(2)}</span></div>
                                    </div>
                                    <hr />
                                    <div className={`breakdown-line quarterly ${paymentDueClass}-text`}><span>{paymentDueText}</span> <span>${Math.abs(tax.currentQuarterPaymentDue).toFixed(2)}</span></div>
                                </div>
                            }
                        />
                    </div>
                    <div className={`value ${paymentDueClass}`}>{tax.currentQuarterPaymentDue < 0 ? `-$${Math.abs(tax.currentQuarterPaymentDue).toFixed(2)}` : `$${tax.currentQuarterPaymentDue.toFixed(2)}`}</div>
                </div>
                 <div className="stat-card">
                    <div className="label">YTD Net Profit (for Tax)</div>
                    <div className="value">${financials.ytd.netProfitForTax.toFixed(2)}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Est. YTD SE Tax</div>
                    <div className="value warning">${tax.totalTaxOnYTDProfit.toFixed(2)}</div>
                </div>
                 <div className="stat-card">
                    <div className="label">Est. Sales Tax Owed</div>
                    <div className="value warning">${tax.estimatedSalesTax.toFixed(2)}</div>
                </div>
            </div>

             <div className="tax-payments">
                <h4>Quarterly Tax Payments Made</h4>
                <div className="payment-inputs">
                    {(['q1', 'q2', 'q3', 'q4'] as const).map(q => (
                        <div className="form-group" key={q}>
                            <label htmlFor={`payment-${q}`}>Q{parseInt(q.substring(1))} Payment</label>
                            <input
                                type="number"
                                id={`payment-${q}`}
                                value={quarterlyPayments[q]}
                                onChange={e => setQuarterlyPayments(p => ({...p, [q]: parseFloat(e.target.value) || 0 }))}
                                placeholder="0.00"
                            />
                        </div>
                    ))}
                </div>
             </div>

             <div className="tax-settings">
                 <div className="form-group">
                    <label htmlFor="se-tax-rate">Self-Employment Tax Rate (%)</label>
                    <input id="se-tax-rate" type="number" value={seTaxRate} onChange={e => setSeTaxRate(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="form-group">
                    <label htmlFor="sales-tax-rate">Sales Tax Rate (%)</label>
                    <input id="sales-tax-rate" type="number" value={salesTaxRate} onChange={e => setSalesTaxRate(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="form-group">
                    <label htmlFor="mileage-rate">IRS Mileage Rate ($)</label>
                    <input id="mileage-rate" type="number" step="0.01" value={irsMileageRate} onChange={e => setIrsMileageRate(parseFloat(e.target.value) || 0)} />
                </div>
             </div>

             <div className="tax-chat-interface">
                <h3>Ask the AI Tax Agent</h3>
                <textarea value={taxQuestion} onChange={e => setTaxQuestion(e.target.value)} placeholder="e.g., Why is my net profit different from my total income?"/>
                <button className="submit-button" onClick={handleAskTaxAgent} disabled={isTaxAgentLoading || !taxQuestion.trim()}>
                    {isTaxAgentLoading ? <span className="loader" /> : 'Ask Question'}
                </button>
                {taxAgentResponse && <div className="agent-response">{taxAgentResponse}</div>}
            </div>
        </div>
    );
}

const RecurringView: React.FC<{
    recurringTransactions: RecurringTransaction[],
    handleAddRecurringTransaction: (rec: Omit<RecurringTransaction, 'id'>) => void,
    handleDeleteRecurringTransaction: (id: number) => void
}> = ({ recurringTransactions, handleAddRecurringTransaction, handleDeleteRecurringTransaction }) => {
     // Dummy form state
    const [recDesc, setRecDesc] = useState('');
    const [recAmount, setRecAmount] = useState(0);
    const [recType, setRecType] = useState<'income'|'expense'>('expense');
    const [recFreq, setRecFreq] = useState<'daily'|'weekly'|'monthly'|'yearly'>('monthly');
    const [recStart, setRecStart] = useState(CURRENT_DATE_ISO);

    const handleAddRec = (e: React.FormEvent) => {
        e.preventDefault();
        const newRec: Omit<RecurringTransaction, 'id'> = {
            description: recDesc,
            frequency: recFreq,
            startDate: recStart,
            nextDueDate: recStart,
            details: {
                vendor: recDesc,
                amount: recAmount,
                currency: 'USD',
                category: 'Recurring Transaction',
                transactionType: recType,
                classification: 'business',
                journal: [] // Simplified for this UI
            }
        };
        handleAddRecurringTransaction(newRec);
        // Reset form
        setRecDesc('');
        setRecAmount(0);
    };

    return (
        <div>
             <div className="module-header">
                <h1>Recurring Transactions</h1>
            </div>
            <div className="card">
                <h3>Add New Recurring Transaction</h3>
                <form onSubmit={handleAddRec}>
                     <div className="form-grid">
                         <div className="form-group full-width">
                             <label>Description</label>
                             <input type="text" value={recDesc} onChange={e => setRecDesc(e.target.value)} required/>
                         </div>
                         <div className="form-group">
                             <label>Amount</label>
                             <input type="number" value={recAmount} onChange={e => setRecAmount(parseFloat(e.target.value) || 0)} required/>
                         </div>
                         <div className="form-group">
                             <label>Type</label>
                             <select value={recType} onChange={e => setRecType(e.target.value as any)}>
                                 <option value="expense">Expense</option>
                                 <option value="income">Income</option>
                             </select>
                         </div>
                          <div className="form-group">
                             <label>Frequency</label>
                             <select value={recFreq} onChange={e => setRecFreq(e.target.value as any)}>
                                 <option value="daily">Daily</option>
                                 <option value="weekly">Weekly</option>
                                 <option value="monthly">Monthly</option>
                                 <option value="yearly">Yearly</option>
                             </select>
                         </div>
                          <div className="form-group">
                             <label>Start Date</label>
                             <input type="date" value={recStart} onChange={e => setRecStart(e.target.value)} required/>
                         </div>
                     </div>
                     <button type="submit" className="btn-primary">Add Schedule</button>
                </form>
            </div>

            <div className="recurring-list">
                {recurringTransactions.length > 0 ? recurringTransactions.map(rt => (
                     <div key={rt.id} className={`recurring-card ${rt.details.transactionType}`}>
                         <div className="recurring-card-info">
                             <span className="recurring-desc">{rt.description}</span>
                             <span className="recurring-details">Next payment: {rt.nextDueDate} ({rt.frequency})</span>
                         </div>
                         <div className="recurring-card-finance">
                             <span className="recurring-amount">${rt.details.amount.toFixed(2)}</span>
                         </div>
                         <button onClick={() => handleDeleteRecurringTransaction(rt.id)} className="delete-btn" aria-label={`Delete recurring transaction ${rt.description}`}>&times;</button>
                     </div>
                )) : <div className="no-data"><p>No recurring transactions scheduled.</p></div>}
            </div>
        </div>
    );
};

const JournalView: React.FC<{ transactions: Transaction[] }> = ({ transactions }) => {
    const journalEntries = useMemo(() => {
        const allEntries: (JournalEntry & { date: string, vendor: string, id: number })[] = [];
        transactions.forEach(t => {
            t.journal.forEach((j, index) => {
                allEntries.push({
                    id: t.id + index,
                    date: t.date,
                    vendor: t.vendor,
                    account: j.account,
                    debit: j.debit,
                    credit: j.credit,
                });
            });
        });
        return allEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions]);

    return (
        <div className="journal-view-container card">
            <div className="module-header">
                <h1>Journal</h1>
            </div>
            <table className="journal-view-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Account</th>
                        <th>Description</th>
                        <th className="amount">Debit</th>
                        <th className="amount">Credit</th>
                    </tr>
                </thead>
                <tbody>
                    {journalEntries.length > 0 ? journalEntries.map((entry, index) => (
                        <tr key={`${entry.id}-${index}`}>
                            <td>{entry.date}</td>
                            <td>{entry.account}</td>
                            <td>{entry.vendor}</td>
                            <td className="amount">{entry.debit ? `$${entry.debit.toFixed(2)}` : ''}</td>
                            <td className="amount">{entry.credit ? `$${entry.credit.toFixed(2)}` : ''}</td>
                        </tr>
                    )) : (
                        <tr>
                            <td colSpan={5} style={{ textAlign: 'center' }}>No journal entries yet.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

const COAView: React.FC<{ chartOfAccounts: Account[], onAddAccount: (account: Account) => void }> = ({ chartOfAccounts, onAddAccount }) => {
    const [newAccountName, setNewAccountName] = useState('');
    const [newAccountType, setNewAccountType] = useState<Account['type']>('Expense');

    const groupedAccounts = useMemo(() => {
        const groups: Record<Account['type'], Account[]> = {
            'Asset': [], 'Liability': [], 'Equity': [], 'Revenue': [], 'Expense': []
        };
        chartOfAccounts.forEach(acc => {
            groups[acc.type].push(acc);
        });
        return groups;
    }, [chartOfAccounts]);

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (newAccountName.trim()) {
            onAddAccount({ name: newAccountName.trim(), type: newAccountType });
            setNewAccountName('');
        }
    };

    return (
        <div className="coa-view-container">
            <div className="card add-account-form">
                 <div className="module-header">
                    <h1>Chart of Accounts</h1>
                </div>
                <h3>Add New Account</h3>
                <form onSubmit={handleAdd}>
                    <div className="form-grid">
                        <div className="form-group">
                            <label>Account Name</label>
                            <input type="text" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label>Account Type</label>
                            <select value={newAccountType} onChange={e => setNewAccountType(e.target.value as Account['type'])}>
                                <option value="Asset">Asset</option>
                                <option value="Liability">Liability</option>
                                <option value="Equity">Equity</option>
                                <option value="Revenue">Revenue</option>
                                <option value="Expense">Expense</option>
                            </select>
                        </div>
                    </div>
                    <button type="submit" className="btn-primary">Add Account</button>
                </form>
            </div>
            <div className="account-groups-grid">
                {(Object.keys(groupedAccounts) as Account['type'][]).map(type => (
                    <div key={type} className="account-group card">
                        <h3>{type}</h3>
                        <ul className="account-list">
                            {groupedAccounts[type].map(acc => <li key={acc.name} className="account-list-item">{acc.name}</li>)}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
};

const TransactionCard = ({ transaction, onEdit, onDelete, projects, onToggleClassification }: { transaction: Transaction, onEdit: (t: Transaction) => void, onDelete: (id: number) => void, projects: Project[], onToggleClassification: (id: number) => void }) => {
    const project = projects.find(p => p.id === transaction.projectId);
    return (
        <div className={`transaction-card ${transaction.transactionType} classification-${transaction.classification}`} key={transaction.id}>
          <div className="field">
            <span className="label">Vendor/Client</span>
            <span className="value">{transaction.vendor}</span>
          </div>
          <div className="field">
            <span className="label">Date</span>
            <span className="value">{transaction.date}</span>
          </div>
          <div className="field">
            <span className="label">Category</span>
            <span className="value">{transaction.category}</span>
          </div>
          <div className="amount">
            {transaction.transactionType === 'income' ? '+' : '-'}
            ${transaction.amount.toFixed(2)}
          </div>

          <div className="tags-container">
                <span className={`classification-tag ${transaction.classification}`}>{transaction.classification}</span>
                {project && <span className="project-tag">{project.name}</span>}
                {transaction.deductible && <span className="deductible-tag">Deductible</span>}
                {transaction.miles && <span className="mileage-tag">{transaction.miles} miles</span>}
          </div>

          <div className="journal-entry">
            <div className="journal-header">
              <span>Account</span>
              <span className="journal-debit">Debit</span>
              <span className="journal-credit">Credit</span>
            </div>
            {transaction.journal.map((j, index) => (
              <div className="journal-line" key={index}>
                <span className="journal-account">{j.account}</span>
                <span className="journal-debit">{j.debit ? `$${j.debit.toFixed(2)}` : '-'}</span>
                <span className="journal-credit">{j.credit ? `$${j.credit.toFixed(2)}` : '-'}</span>
              </div>
            ))}
          </div>

          <div className="transaction-actions">
             <button onClick={() => onToggleClassification(transaction.id)} className="action-btn toggle-btn" aria-label={`Mark transaction as ${transaction.classification === 'business' ? 'Personal' : 'Business'}`}>
                Mark as {transaction.classification === 'business' ? 'Personal' : 'Business'}
            </button>
            <button onClick={() => onEdit(transaction)} className="action-btn edit-btn">Edit</button>
            <button onClick={() => onDelete(transaction.id)} className="action-btn delete-btn">Delete</button>
          </div>
        </div>
    );
};

const ReconciliationView = ({ results }: { results: ReconciliationResults }) => (
    <div className="reconciliation-view">
        <h3>Reconciliation Results</h3>
        <div className="reconciliation-section matched">
            <h4>Matched ({results.matched.length})</h4>
            {results.matched.map(tx => <div className="reconciliation-item" key={tx.id}><span>{tx.vendor} ({tx.date})</span><span>${tx.amount.toFixed(2)}</span></div>)}
        </div>
        <div className="reconciliation-section unmatched-ledger">
            <h4>Unmatched Ledger Items ({results.unmatchedLedger.length})</h4>
            {results.unmatchedLedger.map(tx => <div className="reconciliation-item" key={tx.id}><span>{tx.vendor} ({tx.date})</span><span>${tx.amount.toFixed(2)}</span></div>)}
        </div>
        <div className="reconciliation-section unmatched-bank">
            <h4>Unmatched Bank Items ({results.unmatchedBank.length})</h4>
            {results.unmatchedBank.map((tx, i) => <div className="reconciliation-item" key={i}><span>{tx.description} ({tx.date})</span><span>${tx.amount.toFixed(2)}</span></div>)}
        </div>
    </div>
);

// Fix: A robust, UTC-based calculation to definitively fix aging report inaccuracies.
const getDaysOverdue = (dueDateStr: string): number => {
    if (!dueDateStr) return 0;

    const today = CURRENT_DATE;

    // Get today's date at midnight UTC to ensure a consistent comparison point.
    const today_utc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

    // The 'YYYY-MM-DD' string format is parsed as midnight UTC by Date.parse().
    const due_date_utc = Date.parse(dueDateStr);

    if (isNaN(due_date_utc)) {
        return 0; // Invalid date format
    }

    // If the due date is today or in the future, it is not overdue.
    if (due_date_utc >= today_utc) {
        return 0;
    }

    // Calculate the difference in milliseconds.
    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    const diff_ms = today_utc - due_date_utc;

    // Use Math.floor to count the number of full 24-hour periods that have passed.
    const diff_days = Math.floor(diff_ms / millisecondsPerDay);

    return diff_days;
};


const InvoiceCard = ({ invoice, onUpdateStatus, onDelete }: { invoice: Invoice, onUpdateStatus: (id: number, status: 'Sent' | 'Paid') => void, onDelete: (id: number) => void }) => {
    const daysOverdue = getDaysOverdue(invoice.dueDate);
    const statusClass = invoice.status === 'Paid' ? 'paid' : (daysOverdue > 0 ? 'overdue' : (invoice.status === 'Sent' ? 'sent' : 'draft'));
    const statusText = invoice.status === 'Paid' ? 'Paid' : (daysOverdue > 0 ? `${daysOverdue} days overdue` : invoice.status);

    return (
        <div className={`item-card status-${statusClass}`}>
            <div className="item-main-info">
                <div>
                    <span className="item-name">{invoice.customer}</span>
                    <span className="item-number">Invoice #{invoice.invoiceNumber}</span>
                </div>
                <span className="item-amount">${invoice.amount.toFixed(2)}</span>
            </div>
            <div className="item-details">
                <span>Due: {invoice.dueDate}</span>
                <span className={`status-badge status-${statusClass}`}>{statusText}</span>
            </div>
            {invoice.taxable && <div className="taxable-tag">Taxable</div>}
            <div className="item-actions">
                {invoice.status === 'Draft' && <button className="action-btn" onClick={() => onUpdateStatus(invoice.id, 'Sent')}>Mark as Sent</button>}
                {invoice.status !== 'Paid' && <button className="action-btn" onClick={() => onUpdateStatus(invoice.id, 'Paid')}>Mark as Paid</button>}
                <button className="action-btn delete-btn" onClick={() => onDelete(invoice.id)}>Delete</button>
            </div>
        </div>
    );
};

const BillCard = ({ bill, onUpdateStatus, onDelete }: { bill: Bill, onUpdateStatus: (id: number, status: 'Paid') => void, onDelete: (id: number) => void }) => {
    const daysOverdue = getDaysOverdue(bill.dueDate);
    const statusClass = bill.status === 'Paid' ? 'paid' : (daysOverdue > 0 ? 'overdue' : 'open');
    const statusText = bill.status === 'Paid' ? 'Paid' : (daysOverdue > 0 ? `${daysOverdue} days overdue` : bill.status);

    return (
        <div className={`item-card status-${statusClass}`}>
            <div className="item-main-info">
                <div>
                    <span className="item-name">{bill.vendor}</span>
                    <span className="item-number">Bill #{bill.billNumber}</span>
                </div>
                <span className="item-amount">${bill.amount.toFixed(2)}</span>
            </div>
            <div className="item-details">
                <span>Due: {bill.dueDate}</span>
                <span className={`status-badge status-${statusClass}`}>{statusText}</span>
            </div>
            <div className="item-actions">
                {bill.status !== 'Paid' && <button className="action-btn" onClick={() => onUpdateStatus(bill.id, 'Paid')}>Mark as Paid</button>}
                <button className="action-btn delete-btn" onClick={() => onDelete(bill.id)}>Delete</button>
            </div>
        </div>
    );
};

const Tooltip = ({ text }: { text: React.ReactNode }) => (
    <div className="tooltip-container">
        <span className="info-icon">i</span>
        <div className="tooltip-content">{text}</div>
    </div>
);

const EditTransactionModal = ({ transaction, onClose, onUpdate, chartOfAccounts }: { transaction: Transaction; onClose: () => void; onUpdate: (t: Transaction) => void; chartOfAccounts: Account[] }) => {
    const [formData, setFormData] = useState(transaction);
    const [journal, setJournal] = useState<JournalEntry[]>(transaction.journal);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isNumber = type === 'number';
        setFormData(prev => ({ ...prev, [name]: isNumber ? parseFloat(value) : value }));
    };

    const handleJournalChange = (index: number, field: keyof JournalEntry, value: string) => {
        const newJournal = [...journal];
        const entry = { ...newJournal[index] };
        if (field === 'debit' || field === 'credit') {
            (entry[field] as number | undefined) = value ? parseFloat(value) : undefined;
        } else {
            (entry[field] as string) = value;
        }
        newJournal[index] = entry;
        setJournal(newJournal);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onUpdate({ ...formData, journal });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Edit Transaction</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group"><label>Vendor/Client</label><input type="text" name="vendor" value={formData.vendor} onChange={handleChange} /></div>
                        <div className="form-group"><label>Date</label><input type="date" name="date" value={formData.date} onChange={handleChange} /></div>
                        <div className="form-group"><label>Amount</label><input type="number" name="amount" value={formData.amount} onChange={handleChange} /></div>
                        <div className="form-group"><label>Category</label><input type="text" name="category" value={formData.category} onChange={handleChange} /></div>
                    </div>
                    <h4>Journal Entries</h4>
                    <div className="journal-edit-header">
                        <span>Account</span>
                        <span>Debit</span>
                        <span>Credit</span>
                    </div>
                    {journal.map((j, i) => (
                        <div className="journal-edit-line" key={i}>
                             <select value={j.account} onChange={e => handleJournalChange(i, 'account', e.target.value)}>
                                {chartOfAccounts.map(acc => <option key={acc.name} value={acc.name}>{acc.name}</option>)}
                            </select>
                            <input type="number" step="0.01" value={j.debit ?? ''} onChange={e => handleJournalChange(i, 'debit', e.target.value)} placeholder="0.00" />
                            <input type="number" step="0.01" value={j.credit ?? ''} onChange={e => handleJournalChange(i, 'credit', e.target.value)} placeholder="0.00" />
                        </div>
                    ))}
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const InvoiceModal = ({ onClose, onCreate }: { onClose: () => void; onCreate: (data: Omit<Invoice, 'id'|'status'|'relatedTransactionId'>) => void; }) => {
    const [customer, setCustomer] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(CURRENT_DATE_ISO);
    const [dueDate, setDueDate] = useState('');
    const [amount, setAmount] = useState(0);
    const [taxable, setTaxable] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onCreate({ customer, invoiceNumber, invoiceDate, dueDate, amount, taxable });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Create New Invoice</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group full-width"><label>Customer Name</label><input type="text" value={customer} onChange={e => setCustomer(e.target.value)} required /></div>
                        <div className="form-group"><label>Invoice #</label><input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} required /></div>
                        <div className="form-group"><label>Amount</label><input type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value))} required /></div>
                        <div className="form-group"><label>Invoice Date</label><input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required /></div>
                        <div className="form-group"><label>Due Date</label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required /></div>
                        <div className="form-group form-group-checkbox"><label><input type="checkbox" checked={taxable} onChange={e => setTaxable(e.target.checked)} /> Is this sale taxable?</label></div>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary">Create Invoice</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const BillModal = ({ onClose, onCreate }: { onClose: () => void; onCreate: (data: Omit<Bill, 'id'|'status'|'relatedTransactionId'>) => void; }) => {
    const [vendor, setVendor] = useState('');
    const [billNumber, setBillNumber] = useState('');
    const [billDate, setBillDate] = useState(CURRENT_DATE_ISO);
    const [dueDate, setDueDate] = useState('');
    const [amount, setAmount] = useState(0);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onCreate({ vendor, billNumber, billDate, dueDate, amount });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Record New Bill</h2>
                 <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group full-width"><label>Vendor Name</label><input type="text" value={vendor} onChange={e => setVendor(e.target.value)} required /></div>
                        <div className="form-group"><label>Bill #</label><input type="text" value={billNumber} onChange={e => setBillNumber(e.target.value)} /></div>
                        <div className="form-group"><label>Amount</label><input type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value))} required /></div>
                        <div className="form-group"><label>Bill Date</label><input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} required /></div>
                        <div className="form-group"><label>Due Date</label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required /></div>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary">Create Bill</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);