/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// Define the structure for a journal entry
interface JournalEntry {
  account: string;
  debit?: number;
  credit?: number;
}

// Define the structure for a project/case/job
interface Project {
    id: number;
    name: string;
}

// Define the structure for a transaction, now with a unique ID and journal entries
interface Transaction {
  id: number;
  vendor: string;
  amount: number;
  currency: string;
  date: string;
  category: string;
  transactionType: 'income' | 'expense';
  journal: JournalEntry[];
  reconciled?: boolean;
  projectId?: number; // Link to a project
}

interface BankStatementEntry {
    date: string;
    description: string;
    amount: number;
}

interface ReconciliationResults {
    matched: Transaction[];
    unmatchedLedger: Transaction[];
    unmatchedBank: BankStatementEntry[];
}

// Define the structure for an invoice
interface Invoice {
  id: number;
  customer: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  status: 'Draft' | 'Sent' | 'Paid';
  relatedTransactionId: number; // Links to the initial A/R transaction
}


// --- App Component ---
const App: React.FC = () => {
  const [inputText, setInputText] = useState<string>('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [bankStatementData, setBankStatementData] = useState<string>('');
  const [reconciliationResults, setReconciliationResults] = useState<ReconciliationResults | null>(null);
  const [activeTab, setActiveTab] = useState<'log' | 'ar' | 'projects'>('log');
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);


  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

  const handleProcessTransaction = async () => {
    if (!inputText.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    
    const selectedProject = projects.find(p => p.id === activeProjectId);
    const projectContext = selectedProject ? `This transaction is for the project named "${selectedProject.name}". ` : '';

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${projectContext}From the text below, extract all financial transactions. For each transaction, provide a standard double-entry journal. Infer common account names (e.g., 'Software Expense', 'Bank', 'Accounts Payable', 'Sales Revenue', 'Mileage Expense', 'Materials Cost'). If mileage is mentioned, create an expense. If billable hours and a rate are mentioned, calculate the total and create an income transaction. Text: "${inputText}"`,
        config: {
          systemInstruction: "You are an expert bookkeeper for specialized professionals like lawyers, real estate agents, and contractors. When you see a cash receipt from a customer, determine if it is new revenue or a settlement of Accounts Receivable. For example, 'received $2600 from customer X' should debit Bank and credit Accounts Receivable, not Sales Revenue. When you see project-related expenses like materials or mileage, categorize them appropriately. Calculate totals if hours and rates are provided (e.g., '4 hours at $300/hr').",
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
                    category: { type: Type.STRING, description: "Infer the most likely category (e.g., 'Materials Cost', 'Software', 'Travel', 'Commission Income', 'A/R Settlement', 'Billable Hours')" },
                    transactionType: { type: Type.STRING, description: "Is this 'income' or 'expense'?" },
                    journal: {
                        type: Type.ARRAY,
                        description: "The double-entry journal for the transaction.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                account: { type: Type.STRING, description: "The account name (e.g., 'Bank', 'Materials Cost', 'Accounts Receivable')." },
                                debit: { type: Type.NUMBER, description: "The debit amount." },
                                credit: { type: Type.NUMBER, description: "The credit amount." },
                            },
                             required: ["account"]
                        }
                    }
                },
                required: ["vendor", "amount", "category", "transactionType", "date", "currency", "journal"]
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
      
      const newTransactionsWithIds = parsedTransactions.map(t => ({...t, id: Date.now() + Math.random(), reconciled: false, projectId: activeProjectId }));
      setTransactions(prev => [...newTransactionsWithIds, ...prev]);
      setInputText('');

    } catch (e: any) {
      console.error(e);
      let friendlyMessage = "An unexpected error occurred. Please try again.";
      if (e instanceof Error) {
          // Check for specific error messages to provide better feedback
          if (e.message.includes("API key")) {
              friendlyMessage = "There appears to be a configuration issue with the AI service.";
          } else {
              friendlyMessage = e.message; // Use the message from our custom errors
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

  const handleOpenEditModal = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsEditModalOpen(true);
  };

  const handleUpdateTransaction = (updatedTransaction: Transaction) => {
    setTransactions(prev => prev.map(t => t.id === updatedTransaction.id ? updatedTransaction : t));
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
        category: 'Sales Revenue',
        transactionType: 'income',
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

    setTransactions(prev => [newTransaction, ...prev]);
    setInvoices(prev => [newInvoice, ...prev]);
    setIsInvoiceModalOpen(false);
  };

  const handleUpdateInvoiceStatus = (invoiceId: number, status: 'Sent' | 'Paid') => {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) return;

      if (status === 'Paid' && invoice.status !== 'Paid') {
          // Create the cash settlement transaction
          const settlementTransaction: Transaction = {
              id: Date.now() + Math.random(),
              vendor: invoice.customer,
              amount: invoice.amount,
              currency: 'USD',
              date: new Date().toISOString().split('T')[0], // Today's date
              category: 'A/R Settlement',
              transactionType: 'income',
              journal: [
                  { account: 'Bank', debit: invoice.amount },
                  { account: 'Accounts Receivable', credit: invoice.amount }
              ],
              reconciled: false
          };
          setTransactions(prev => [settlementTransaction, ...prev]);
      }

      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? {...inv, status} : inv));
  };
  
  const handleDeleteInvoice = (invoiceId: number) => {
    if (window.confirm('Are you sure you want to delete this invoice and its related transaction?')) {
        const invoiceToDelete = invoices.find(inv => inv.id === invoiceId);
        if (invoiceToDelete) {
            // Also delete the initial A/R transaction
            setTransactions(prev => prev.filter(t => t.id !== invoiceToDelete.relatedTransactionId));
            setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
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

  return (
    <>
      <header className="header">
        <h1>FinTrack AI</h1>
        <p>Your AI-powered bookkeeping assistant for specialized professionals.</p>
      </header>
      <main className="container">
        <section className="input-section">
          <h2>New Transaction</h2>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="e.g., Bought $500 of lumber for 'Johnson Deck' job... or... drove 50 miles for showings..."
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
                className="bank-statement-input"
                value={bankStatementData}
                onChange={(e) => setBankStatementData(e.target.value)}
                placeholder="2024-05-20,Figma Subscription,-120.00&#10;2024-05-21,Client Payment,2600.00"
              />
              <button onClick={handleReconcile} className="reconcile-button">Reconcile</button>
            </div>
        </section>
        <section className="log-section">
            <Dashboard transactions={transactions} invoices={invoices} projects={projects} />
            {reconciliationResults && <ReconciliationView results={reconciliationResults} />}

            <div className="tab-nav">
                <button 
                    className={`tab-button ${activeTab === 'log' ? 'active' : ''}`}
                    onClick={() => setActiveTab('log')}
                    aria-pressed={activeTab === 'log'}
                >
                    Transaction Log
                </button>
                <button 
                    className={`tab-button ${activeTab === 'ar' ? 'active' : ''}`}
                    onClick={() => setActiveTab('ar')}
                    aria-pressed={activeTab === 'ar'}
                >
                    Accounts Receivable
                </button>
                 <button 
                    className={`tab-button ${activeTab === 'projects' ? 'active' : ''}`}
                    onClick={() => setActiveTab('projects')}
                    aria-pressed={activeTab === 'projects'}
                >
                    Projects
                </button>
            </div>

            {activeTab === 'log' && (
                <>
                    <h2>Transaction Log</h2>
                    {transactions.length > 0 ? (
                        <div className="transaction-list">
                        {transactions.map((t) => (
                            <TransactionCard 
                                key={t.id} 
                                transaction={t}
                                projectName={projects.find(p => p.id === t.projectId)?.name}
                                onDelete={handleDeleteTransaction}
                                onEdit={handleOpenEditModal}
                            />
                        ))}
                        </div>
                    ) : (
                        <div className="empty-log">
                            <p>Your processed transactions will appear here.</p>
                        </div>
                    )}
                </>
            )}

            {activeTab === 'ar' && (
                <AccountsReceivableView 
                    invoices={invoices}
                    onUpdateStatus={handleUpdateInvoiceStatus}
                    onDelete={handleDeleteInvoice}
                    onOpenCreateModal={() => setIsInvoiceModalOpen(true)}
                />
            )}
            
            {activeTab === 'projects' && (
                <ProjectsView
                    projects={projects}
                    onAddProject={handleAddProject}
                    onDeleteProject={handleDeleteProject}
                />
            )}
        </section>
      </main>
      {isEditModalOpen && editingTransaction && (
        <EditTransactionModal 
            transaction={editingTransaction}
            onClose={() => setIsEditModalOpen(false)}
            onSave={handleUpdateTransaction}
        />
      )}
      {isInvoiceModalOpen && (
        <InvoiceModal 
            onClose={() => setIsInvoiceModalOpen(false)}
            onSave={handleCreateInvoice}
        />
      )}
    </>
  );
};


// --- Dashboard Component ---
const Dashboard: React.FC<{ transactions: Transaction[], invoices: Invoice[], projects: Project[] }> = ({ transactions, invoices, projects }) => {
    const summary = useMemo(() => transactions.reduce((acc, t) => {
        // Only count transactions as income if they are not A/R settlements.
        // The revenue was already recognized when the invoice was created.
        if (t.transactionType === 'income' && t.category !== 'A/R Settlement') {
            acc.income += t.amount;
        } else if (t.transactionType === 'expense') {
            acc.expenses += t.amount;
            acc.categoryTotals[t.category] = (acc.categoryTotals[t.category] || 0) + t.amount;
        }
        return acc;
    }, { income: 0, expenses: 0, net: 0, categoryTotals: {} as Record<string, number> }), [transactions]);

    summary.net = summary.income - summary.expenses;

    const sortedCategories = useMemo(() => Object.entries(summary.categoryTotals).sort(([, a], [, b]) => b - a), [summary.categoryTotals]);

    const outstandingAR = useMemo(() => invoices
        .filter(inv => inv.status !== 'Paid')
        .reduce((sum, inv) => sum + inv.amount, 0), [invoices]);

    return (
        <div className="dashboard-section">
             <div className="stat-card-grid">
                <div className="stat-card">
                    <span className="label">Total Income</span>
                    <span className="value income">${summary.income.toFixed(2)}</span>
                </div>
                <div className="stat-card">
                    <span className="label">Total Expenses</span>
                    <span className="value expense">${summary.expenses.toFixed(2)}</span>
                </div>
                <div className="stat-card">
                    <span className="label">Net Profit</span>
                    <span className={`value ${summary.net >= 0 ? 'income' : 'expense'}`}>
                        ${summary.net.toFixed(2)}
                    </span>
                </div>
                 <div className="stat-card">
                    <span className="label">Outstanding A/R</span>
                    <span className="value warning">${outstandingAR.toFixed(2)}</span>
                </div>
            </div>
            
            <ProjectSummary projects={projects} transactions={transactions} />

            <div className="pnl-statement">
              <h3>Profit & Loss Statement</h3>
               <div className="pnl-header">
                <span></span>
                <span>Current Period</span>
              </div>
              <div className="pnl-section">
                <div className="pnl-line">
                  <span>Revenue</span>
                  <span className="pnl-amount">${summary.income.toFixed(2)}</span>
                </div>
              </div>
              <div className="pnl-section">
                <span>Expenses</span>
                {sortedCategories.length > 0 ? sortedCategories.map(([category, amount]) => (
                  <div key={category} className="pnl-line detail">
                    <span>{category}</span>
                    <span className="pnl-amount">${amount.toFixed(2)}</span>
                  </div>
                )) : <div className="pnl-line detail"><span className="no-data">No expenses</span><span>$0.00</span></div>}
                <div className="pnl-line total">
                  <span>Total Expenses</span>
                  <span className="pnl-amount">${summary.expenses.toFixed(2)}</span>
                </div>
              </div>
              <div className="pnl-line net-profit">
                <span>Net Profit</span>
                <span className={`pnl-amount ${summary.net >= 0 ? 'income' : 'expense'}`}>
                  ${summary.net.toFixed(2)}
                </span>
              </div>
            </div>
            
            <div className="expense-analysis-container">
              <div className="category-breakdown">
                  <h3>Expense Analysis</h3>
                  <ul>
                      {sortedCategories.length > 0 ? sortedCategories.map(([category, amount]) => (
                          <li key={category}>
                              <div className="category-info">
                                  <span>{category}</span>
                                  <span>${amount.toFixed(2)}</span>
                              </div>
                              <div className="category-bar-container">
                                  <div
                                      className="category-bar"
                                      style={{ width: summary.expenses > 0 ? `${(amount / summary.expenses) * 100}%` : '0%' }}
                                  ></div>
                              </div>
                          </li>
                      )) : <p className="no-data">No expense data yet.</p>}
                  </ul>
              </div>
              <div className="pie-chart-section">
                 <PieChart data={sortedCategories} total={summary.expenses} />
              </div>
            </div>
        </div>
    );
};

const ProjectSummary: React.FC<{ projects: Project[], transactions: Transaction[] }> = ({ projects, transactions }) => {
    const summary = useMemo(() => {
        const projectData: Record<number, { name: string, income: number, expenses: number }> = {};
        projects.forEach(p => {
            projectData[p.id] = { name: p.name, income: 0, expenses: 0 };
        });

        transactions.forEach(t => {
            if (t.projectId && projectData[t.projectId]) {
                if (t.transactionType === 'income' && t.category !== 'A/R Settlement') {
                    projectData[t.projectId].income += t.amount;
                } else if (t.transactionType === 'expense') {
                    projectData[t.projectId].expenses += t.amount;
                }
            }
        });

        return Object.values(projectData);
    }, [projects, transactions]);

    if (summary.length === 0) return null;

    return (
        <div className="project-summary pnl-statement">
            <h3>Project Summary</h3>
            <div className="pnl-header">
                <span>Project Name</span>
                <span style={{textAlign: 'right'}}>Income</span>
                <span style={{textAlign: 'right'}}>Expenses</span>
                <span style={{textAlign: 'right'}}>Net Profit</span>
            </div>
            {summary.map(p => {
                const net = p.income - p.expenses;
                return (
                    <div key={p.name} className="pnl-line project-line">
                        <span>{p.name}</span>
                        <span className="pnl-amount income">${p.income.toFixed(2)}</span>
                        <span className="pnl-amount expense">${p.expenses.toFixed(2)}</span>
                        <span className={`pnl-amount ${net >= 0 ? 'income' : 'expense'}`}>${net.toFixed(2)}</span>
                    </div>
                );
            })}
        </div>
    );
};


// --- Projects View Component ---
const ProjectsView: React.FC<{
    projects: Project[],
    onAddProject: (name: string) => void,
    onDeleteProject: (id: number) => void
}> = ({ projects, onAddProject, onDeleteProject }) => {
    const [newProjectName, setNewProjectName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onAddProject(newProjectName);
        setNewProjectName('');
    };

    return (
        <div className="projects-view">
            <h2>Projects / Cases / Jobs</h2>
            <form onSubmit={handleSubmit} className="add-project-form">
                <input
                    type="text"
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    placeholder="Enter new project name"
                    required
                />
                <button type="submit" className="btn-primary">Add Project</button>
            </form>
            <div className="project-list">
                {projects.length > 0 ? projects.map(p => (
                    <div key={p.id} className="project-card">
                        <span>{p.name}</span>
                        <button onClick={() => onDeleteProject(p.id)} className="delete-btn">&times;</button>
                    </div>
                )) : <p className="no-data">No projects created yet.</p>}
            </div>
        </div>
    );
};

// --- A/R Components ---
const AccountsReceivableView: React.FC<{
    invoices: Invoice[],
    onUpdateStatus: (id: number, status: 'Sent' | 'Paid') => void,
    onDelete: (id: number) => void,
    onOpenCreateModal: () => void
}> = ({ invoices, onUpdateStatus, onDelete, onOpenCreateModal }) => {
    return (
        <div className="ar-view">
            <div className="ar-header">
                <h2>Accounts Receivable</h2>
                <button onClick={onOpenCreateModal} className="btn-primary">Create Invoice</button>
            </div>
            {invoices.length > 0 ? (
                <div className="invoice-list">
                    {invoices.map(invoice => (
                        <InvoiceCard 
                            key={invoice.id} 
                            invoice={invoice} 
                            onUpdateStatus={onUpdateStatus}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            ) : (
                <div className="empty-log">
                    <p>Your invoices will appear here.</p>
                </div>
            )}
        </div>
    );
};

const InvoiceCard: React.FC<{
    invoice: Invoice,
    onUpdateStatus: (id: number, status: 'Sent' | 'Paid') => void,
    onDelete: (id: number) => void
}> = ({ invoice, onUpdateStatus, onDelete }) => {
    const today = new Date().toISOString().split('T')[0];
    let displayStatus: 'Draft' | 'Sent' | 'Paid' | 'Overdue' = invoice.status;
    if (invoice.status !== 'Paid' && invoice.dueDate < today) {
        displayStatus = 'Overdue';
    }

    return (
        <div className={`invoice-card status-${displayStatus.toLowerCase()}`}>
            <div className="invoice-main-info">
                <div>
                    <span className="customer-name">{invoice.customer}</span>
                    <span className="invoice-number">Inv #{invoice.invoiceNumber}</span>
                </div>
                <div className="invoice-amount">${invoice.amount.toFixed(2)}</div>
            </div>
            <div className="invoice-details">
                <span>Due: {invoice.dueDate}</span>
                <span className={`status-badge status-${displayStatus.toLowerCase()}`}>{displayStatus}</span>
            </div>
            <div className="invoice-actions">
                {invoice.status === 'Draft' && <button onClick={() => onUpdateStatus(invoice.id, 'Sent')} className="action-btn">Mark as Sent</button>}
                {invoice.status !== 'Paid' && <button onClick={() => onUpdateStatus(invoice.id, 'Paid')} className="action-btn">Mark as Paid</button>}
                <button onClick={() => onDelete(invoice.id)} className="action-btn delete-btn">Delete</button>
            </div>
        </div>
    );
}

const InvoiceModal: React.FC<{
    onClose: () => void,
    onSave: (invoiceData: Omit<Invoice, 'id' | 'status' | 'relatedTransactionId'>) => void
}> = ({ onClose, onSave }) => {
    const [customer, setCustomer] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState('');
    const [amount, setAmount] = useState<number | ''>('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (customer && invoiceNumber && invoiceDate && dueDate && typeof amount === 'number' && amount > 0) {
            onSave({ customer, invoiceNumber, invoiceDate, dueDate, amount });
        } else {
            alert('Please fill out all fields correctly.');
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Create New Invoice</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group">
                            <label htmlFor="customer-name">Customer Name</label>
                            <input id="customer-name" type="text" value={customer} onChange={e => setCustomer(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="invoice-number">Invoice Number</label>
                            <input id="invoice-number" type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} required />
                        </div>
                         <div className="form-group">
                            <label htmlFor="invoice-date">Invoice Date</label>
                            <input id="invoice-date" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="due-date">Due Date</label>
                            <input id="due-date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
                        </div>
                        <div className="form-group full-width">
                            <label htmlFor="amount">Amount</label>
                            <input id="amount" type="number" step="0.01" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || '')} required min="0.01" />
                        </div>
                    </div>
                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                        <button type="submit" className="btn-primary">Create Invoice</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- Pie Chart Component ---
const PieChart: React.FC<{ data: [string, number][], total: number }> = ({ data, total }) => {
    if (total === 0) return <div className="pie-chart-container"><p className="no-data">No expense data to display chart.</p></div>;

    const colors = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899'];
    let cumulativePercent = 0;

    const slices = data.map(([category, amount], i) => {
        const percent = amount / total;
        const startAngle = cumulativePercent * 360;
        cumulativePercent += percent;
        const endAngle = cumulativePercent * 360;
        const largeArcFlag = percent > 0.5 ? 1 : 0;

        const x1 = 50 + 40 * Math.cos(Math.PI * startAngle / 180);
        const y1 = 50 + 40 * Math.sin(Math.PI * startAngle / 180);
        const x2 = 50 + 40 * Math.cos(Math.PI * endAngle / 180);
        const y2 = 50 + 40 * Math.sin(Math.PI * endAngle / 180);

        const d = `M50,50 L${x1},${y1} A40,40 0 ${largeArcFlag},1 ${x2},${y2} Z`;

        return { path: d, color: colors[i % colors.length], category };
    });

    return (
        <div className="pie-chart-container">
            <svg viewBox="0 0 100 100" className="pie-chart">
                {slices.map((slice, i) => (
                    <path key={i} d={slice.path} fill={slice.color} />
                ))}
            </svg>
             <div className="pie-chart-legend">
                {slices.map((slice, i) => (
                    <div key={i} className="legend-item">
                        <span className="legend-color-box" style={{ backgroundColor: slice.color }}></span>
                        <span>{slice.category}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Reconciliation View Component ---
const ReconciliationView: React.FC<{ results: ReconciliationResults }> = ({ results }) => {
    return (
        <div className="reconciliation-view">
            <h3>Reconciliation Results</h3>
            <div className="reconciliation-section matched">
                <h4>Matched Transactions ({results.matched.length})</h4>
                {results.matched.map(tx => (
                    <div key={tx.id} className="reconciliation-item">
                        <span>{tx.date} - {tx.vendor}</span>
                        <span>${tx.amount.toFixed(2)}</span>
                    </div>
                ))}
            </div>
             <div className="reconciliation-section unmatched-ledger">
                <h4>Unmatched in Ledger ({results.unmatchedLedger.length})</h4>
                {results.unmatchedLedger.map(tx => (
                    <div key={tx.id} className="reconciliation-item">
                       <span>{tx.date} - {tx.vendor}</span>
                       <span>${tx.amount.toFixed(2)}</span>
                    </div>
                ))}
            </div>
             <div className="reconciliation-section unmatched-bank">
                <h4>Unmatched in Bank ({results.unmatchedBank.length})</h4>
                 {results.unmatchedBank.map((tx, i) => (
                    <div key={i} className="reconciliation-item">
                       <span>{tx.date} - {tx.description}</span>
                       <span>${tx.amount.toFixed(2)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};


// --- TransactionCard Component ---
const TransactionCard: React.FC<{ 
    transaction: Transaction,
    projectName?: string,
    onDelete: (id: number) => void,
    onEdit: (transaction: Transaction) => void
}> = ({ transaction, projectName, onDelete, onEdit }) => {
  const { id, vendor, amount, currency, date, category, transactionType, journal } = transaction;
  const isIncome = transactionType === 'income';
  const formattedAmount = `${isIncome ? '+' : '-'}$${amount.toFixed(2)}`;

  return (
    <div className={`transaction-card ${transactionType}`}>
      <div className="field">
        <span className="label">Vendor</span>
        <span className="value">{vendor}</span>
      </div>
      <div className="field">
        <span className="label">Date</span>
        <span className="value">{date}</span>
      </div>
      <div className="field">
        <span className="label">Category</span>
        <span className="value">{category}</span>
      </div>
      <div className="field">
         <span className="label">Currency</span>
         <span className="value">{currency}</span>
      </div>
      <div className={`amount`}>
        {formattedAmount}
      </div>
      {projectName && (
        <div className="project-tag-container">
            <span className="project-tag">{projectName}</span>
        </div>
       )}
      <div className="journal-entry">
          <div className="journal-header">
              <span>Account</span>
              <span>Debit</span>
              <span>Credit</span>
          </div>
          {journal.map((entry, idx) => (
              <div key={idx} className="journal-line">
                  <span className="journal-account">{entry.account}</span>
                  <span className="journal-debit">{entry.debit ? `$${entry.debit.toFixed(2)}` : '-'}</span>
                  <span className="journal-credit">{entry.credit ? `$${entry.credit.toFixed(2)}` : '-'}</span>
              </div>
          ))}
      </div>
      <div className="transaction-actions">
          <button onClick={() => onEdit(transaction)} className="action-btn edit-btn">Edit</button>
          <button onClick={() => onDelete(id)} className="action-btn delete-btn">Delete</button>
      </div>
    </div>
  );
};


// --- Edit Transaction Modal ---
const EditTransactionModal: React.FC<{ transaction: Transaction, onClose: () => void, onSave: (transaction: Transaction) => void }> = ({ transaction, onClose, onSave }) => {
    const [formData, setFormData] = useState<Transaction>({...transaction});
    const [validationError, setValidationError] = useState<string | null>(null);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({...prev, [name]: name === 'amount' ? parseFloat(value) : value }));
    };

    const handleJournalChange = (index: number, field: keyof JournalEntry, value: string) => {
        const newJournal = [...formData.journal];
        const entry = {...newJournal[index]};
        if (field === 'account') {
            entry.account = value;
        } else {
            const numValue = parseFloat(value);
            (entry[field] as number) = isNaN(numValue) ? undefined : numValue;
        }
        newJournal[index] = entry;
        setFormData(prev => ({...prev, journal: newJournal}));
    };
    
    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        setValidationError(null);

        const totalDebits = formData.journal.reduce((sum, entry) => sum + (entry.debit || 0), 0);
        const totalCredits = formData.journal.reduce((sum, entry) => sum + (entry.credit || 0), 0);

        if (totalDebits.toFixed(2) !== totalCredits.toFixed(2)) {
            setValidationError('Journal is not balanced. Total debits must equal total credits.');
            return;
        }
        
        // **BUG FIX**: Recalculate main amount from journal to ensure data consistency
        const updatedTransaction = { ...formData, amount: totalDebits };

        onSave(updatedTransaction);
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Edit Transaction</h2>
                <form onSubmit={handleSave}>
                    <div className="form-grid">
                        <div className="form-group">
                            <label>Vendor</label>
                            <input type="text" name="vendor" value={formData.vendor} onChange={handleInputChange} />
                        </div>
                        <div className="form-group">
                            <label>Amount (auto-calculated)</label>
                            <input type="number" step="0.01" name="amount" value={formData.amount} onChange={handleInputChange} readOnly/>
                        </div>
                         <div className="form-group">
                            <label>Date</label>
                            <input type="date" name="date" value={formData.date} onChange={handleInputChange} />
                        </div>
                        <div className="form-group">
                            <label>Category</label>
                            <input type="text" name="category" value={formData.category} onChange={handleInputChange} />
                        </div>
                        <div className="form-group">
                             <label>Type</label>
                             <select name="transactionType" value={formData.transactionType} onChange={handleInputChange}>
                                 <option value="expense">Expense</option>
                                 <option value="income">Income</option>
                             </select>
                         </div>
                    </div>
                   
                    <h4>Journal Entries</h4>
                    <div className="journal-edit-header">
                        <span>Account</span>
                        <span>Debit</span>
                        <span>Credit</span>
                    </div>
                    {formData.journal.map((entry, index) => (
                        <div key={index} className="journal-edit-line">
                            <input 
                                type="text" 
                                value={entry.account} 
                                onChange={(e) => handleJournalChange(index, 'account', e.target.value)} 
                            />
                            <input 
                                type="number" 
                                step="0.01"
                                value={entry.debit ?? ''} 
                                onChange={(e) => handleJournalChange(index, 'debit', e.target.value)} 
                                placeholder="0.00"
                            />
                            <input 
                                type="number" 
                                step="0.01"
                                value={entry.credit ?? ''} 
                                onChange={(e) => handleJournalChange(index, 'credit', e.target.value)} 
                                placeholder="0.00"
                            />
                        </div>
                    ))}

                    {validationError && <div className="validation-error">{validationError}</div>}
                    
                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                        <button type="submit" className="btn-primary">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);