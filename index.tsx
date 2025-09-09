/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';


// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyCZVuMksiSkmJ0B5-7ljRtFgNVpcllo5JA",
    authDomain: "clario-b3dfd.firebaseapp.com",
    projectId: "clario-b3dfd",
    storageBucket: "clario-b3dfd.firebasestorage.app",
    messagingSenderId: "769070251641",
    appId: "1:769070251641:web:5f82ce7d5d48c7b2ac5ea8",
    measurementId: "G-9510BNDX49"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);


// --- App Constants ---
const CURRENT_DATE = new Date('2025-09-05T12:00:00Z'); // Use a specific time in UTC to avoid timezone issues
const CURRENT_DATE_ISO = CURRENT_DATE.toISOString().split('T')[0];

// --- Data Structures ---
interface Account { name: string; type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'; }
interface JournalEntry { account: string; debit?: number; credit?: number; }
interface Project { id: string; name: string; }
interface Transaction {
  id: string; vendor: string; amount: number; currency: string; date: string; category: string;
  transactionType: 'income' | 'expense'; journal: JournalEntry[]; reconciled?: boolean;
  projectId?: string; deductible?: boolean; miles?: number; classification: 'business' | 'personal';
  vatAmount?: number; vatType?: 'input' | 'output';
}
interface BankStatementEntry { date: string; description: string; amount: number; }
interface ReconciliationResults { matched: Transaction[]; unmatchedLedger: Transaction[]; unmatchedBank: BankStatementEntry[]; }
interface Invoice {
  id: string; customer: string; invoiceNumber: string; invoiceDate: string; dueDate: string;
  amount: number; status: 'Draft' | 'Sent' | 'Paid'; relatedTransactionId: string; taxable?: boolean;
}
interface Bill {
  id: string; vendor: string; billNumber: string; billDate: string; dueDate: string;
  amount: number; status: 'Open' | 'Paid'; relatedTransactionId: string;
}
interface RecurringTransaction {
  id: string;
  recurringType: 'payment' | 'depreciation';
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  startDate: string;
  nextDueDate: string;
  details: Omit<Transaction, 'id' | 'date' | 'reconciled'>;
  assetCost?: number;
  depreciationPeriodYears?: number;
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
interface VATSummary {
    totalOutputVAT: number; totalInputVAT: number; netVatPayable: number;
}
interface Financials {
  q1: FinancialSummary; q2: FinancialSummary; q3: FinancialSummary; q4: FinancialSummary;
  ytd: FinancialSummary; tax: TaxData; vat: VATSummary;
}
interface Review {
  id: string;
  reviewerName: string;
  reviewerImageUrl: string;
  rating: number;
  comment: string;
  date: string;
}
interface Expert {
  id: string;
  name: string;
  title: string;
  location: string;
  profileImageUrl: string;
  hourlyRate: number;
  rating: number;
  reviewCount: number;
  bio: string;
  services: { name: string; description: string; price: string; }[];
  skills: string[];
  reviews: Review[];
  verified: boolean;
  responseTime: string;
  joinedDate: string;
}
type AgingData = { current: number; '1-30': number; '31-60': number; '61-90': number; '90+': number; total: number; };
type ActiveTab = 'home' | 'transactions' | 'ar' | 'ap' | 'recurring' | 'journal' | 'coa' | 'projects' | 'knowledge' | 'tax' | 'findExperts';
type SearchResults = {
    transactions: Transaction[];
    invoices: Invoice[];
    bills: Bill[];
    projects: Project[];
} | null;
type AuthState = 'loading' |'loggedOut' | 'loggingIn' | 'loggedIn' | 'viewingPrivacy' | 'viewingPublicProfile' | 'expertSignup';


// --- Default Data ---
const initialChartOfAccounts: Account[] = [
    // Assets
    { name: 'Bank', type: 'Asset' },
    { name: 'Accounts Receivable', type: 'Asset' },
    { name: 'Allowance for Doubtful Accounts', type: 'Asset' },
    { name: 'Prepaid Expenses', type: 'Asset' },
    { name: 'Accumulated Depreciation', type: 'Asset' },
    // Liabilities
    { name: 'Accounts Payable', type: 'Liability' },
    { name: 'Credit Card', type: 'Liability' },
    { name: 'Sales Tax Payable', type: 'Liability' },
    { name: 'VAT Payable', type: 'Liability' },
    // Equity
    { name: 'Owner\'s Equity', type: 'Equity' },
    // Revenue
    { name: 'Sales Revenue', type: 'Revenue' },
    { name: 'Service Income', type: 'Revenue' },
    { name: 'Other Income', type: 'Revenue' },
    // Expenses
    { name: 'Advertising & Marketing', type: 'Expense' },
    { name: 'Bad Debt Expense', type: 'Expense' },
    { name: 'Bank Fees', type: 'Expense' },
    { name: 'Cost of Goods Sold', type: 'Expense' },
    { name: 'Depreciation Expense', type: 'Expense' },
    { name: 'Dues & Subscriptions', type: 'Expense' },
    { name: 'Insurance Expense', type: 'Expense' },
    { name: 'Labor Cost', type: 'Expense' },
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

const mockExperts: Expert[] = [
    {
        id: '1',
        name: 'Sarah Chen',
        title: 'Certified Public Accountant (CPA)',
        location: 'New York, NY',
        profileImageUrl: 'https://i.pravatar.cc/150?img=1',
        hourlyRate: 125,
        rating: 4.9,
        reviewCount: 82,
        bio: "With over 10 years of experience serving small businesses and startups, I specialize in tax planning, compliance, and financial strategy. My goal is to help you build a solid financial foundation so you can focus on growth. I'm proficient in QuickBooks, Xero, and multi-state tax law.",
        services: [
            { name: 'Quarterly Tax Filing', description: 'Complete preparation and filing of your quarterly estimated taxes.', price: '$500 per quarter' },
            { name: 'Bookkeeping Cleanup', description: 'A one-time project to organize and reconcile up to 12 months of transactions.', price: '$1,200 one-time' },
            { name: 'Strategic Tax Advisory', description: 'Ongoing consultation to minimize your tax burden and maximize deductions.', price: '$250/hr' },
        ],
        skills: ['Tax Planning', 'QuickBooks Online', 'IRS Representation', 'Financial Strategy', 'LLC Formation'],
        reviews: [
            { id: 'r1', reviewerName: 'James Maxwell', reviewerImageUrl: 'https://i.pravatar.cc/150?img=2', rating: 5, comment: 'Sarah is a lifesaver! She cleaned up years of messy books and helped us save thousands on our taxes.', date: '2025-08-15' },
            { id: 'r2', reviewerName: 'Fresh Blooms LLC', reviewerImageUrl: 'https://i.pravatar.cc/150?img=3', rating: 5, comment: 'Incredibly knowledgeable and responsive. Highly recommend for any e-commerce business.', date: '2025-07-22' },
        ],
        verified: true,
        responseTime: 'Within 4 hours',
        joinedDate: '2024-03-12',
    },
    {
        id: '2',
        name: 'David Rodriguez',
        title: 'Pro Bookkeeper & Payroll Specialist',
        location: 'Austin, TX',
        profileImageUrl: 'https://i.pravatar.cc/150?img=4',
        hourlyRate: 75,
        rating: 5.0,
        reviewCount: 115,
        bio: "I'm a dedicated bookkeeper with a passion for helping creative freelancers and agencies get their finances in order. I provide meticulous monthly bookkeeping, payroll services, and easy-to-understand financial reports to give you clarity and peace of mind.",
        services: [
            { name: 'Monthly Bookkeeping', description: 'Includes categorization of all transactions, bank reconciliation, and monthly P&L and Balance Sheet reports.', price: '$450/month' },
            { name: 'Payroll for up to 5 Employees', description: 'Full-service payroll processing, including tax filings.', price: '$150 + $10/employee per month' },
            { name: 'QuickBooks Setup', description: 'Custom setup of your QuickBooks Online account with a personalized chart of accounts.', price: '$600 one-time' },
        ],
        skills: ['Bookkeeping', 'Payroll', 'QuickBooks', 'Xero', 'Financial Reporting', 'Accounts Payable/Receivable'],
        reviews: [
            { id: 'r3', reviewerName: 'Creative Spark Agency', reviewerImageUrl: 'https://i.pravatar.cc/150?img=5', rating: 5, comment: 'David is the best. He handles everything flawlessly so we can focus on our clients. Our books have never been cleaner.', date: '2025-09-01' },
            { id: 'r4', reviewerName: 'Lena Petrova', reviewerImageUrl: 'https://i.pravatar.cc/150?img=6', rating: 5, comment: "As a freelance designer, I used to dread bookkeeping. David makes it completely painless. He's organized, professional, and a pleasure to work with.", date: '2025-08-10' },
        ],
        verified: true,
        responseTime: 'Within 2 hours',
        joinedDate: '2023-11-05',
    },
    {
        id: '3',
        name: 'Maria Garcia',
        title: 'E-commerce & Inventory Specialist',
        location: 'Miami, FL',
        profileImageUrl: 'https://i.pravatar.cc/150?img=7',
        hourlyRate: 90,
        rating: 4.8,
        reviewCount: 64,
        bio: "I help e-commerce businesses thrive by untangling the complexities of inventory management, sales tax, and COGS. With expertise in platforms like Shopify, Amazon FBA, and WooCommerce, I ensure your financials accurately reflect your business's performance.",
        services: [
            { name: 'E-commerce Bookkeeping', description: 'Specialized monthly bookkeeping for Shopify/Amazon stores, including sales tax management.', price: '$600/month' },
            { name: 'COGS & Inventory Setup', description: 'Properly set up and calculate Cost of Goods Sold and inventory tracking systems.', price: '$800 one-time' },
        ],
        skills: ['E-commerce Accounting', 'Shopify', 'Amazon FBA', 'Sales Tax', 'Inventory Management', 'Cost of Goods Sold (COGS)'],
        reviews: [
            { id: 'r5', reviewerName: 'Gadget Grove', reviewerImageUrl: 'https://i.pravatar.cc/150?img=8', rating: 5, comment: 'Maria is an expert in e-commerce. She helped us finally get a handle on our inventory and profitability. A must-hire for any online seller!', date: '2025-08-25' },
        ],
        verified: false,
        responseTime: 'Within 24 hours',
        joinedDate: '2024-08-20',
    }
];


// --- Auth Components ---
const BrowseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>;
const MessageIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>;
const HireIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>;

const HowItWorksSection: React.FC = () => (
    <section className="how-it-works-section">
        <div className="section-header">
            <h2>How It Works</h2>
            <p>Find your perfect financial partner in three simple steps.</p>
        </div>
        <div className="steps-grid">
            <div className="step-card">
                <div className="step-icon"><BrowseIcon /></div>
                <h3>1. Browse Experts</h3>
                <p>Search our network of vetted professionals. Filter by service, industry, and price to find the right fit for your business.</p>
            </div>
            <div className="step-card">
                <div className="step-icon"><MessageIcon /></div>
                <h3>2. Send a Message</h3>
                <p>Review profiles, read reviews, and connect directly with experts to discuss your needs before you commit. No obligation.</p>
            </div>
            <div className="step-card">
                <div className="step-icon"><HireIcon /></div>
                <h3>3. Hire with Confidence</h3>
                <p>Agree on the scope and price, then hire your chosen expert. All work and communication happens on our secure platform.</p>
            </div>
        </div>
    </section>
);

const FeaturedExpertsSection: React.FC<{ experts: Expert[], onSelectExpert: (id: string) => void }> = ({ experts, onSelectExpert }) => (
    <section className="featured-experts-section">
        <div className="section-header">
            <h2>Meet Our Top-Rated Experts</h2>
            <p>Get a glimpse of the incredible talent ready to help you.</p>
        </div>
        <div className="experts-grid">
            {experts.slice(0, 3).map(expert => (
                <ExpertCard key={expert.id} expert={expert} onViewProfile={() => onSelectExpert(expert.id)} />
            ))}
        </div>
    </section>
);

const AutomationIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const TaxComplianceIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const CashFlowIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;

const WhyClarioSection: React.FC<{ onCTAClick: () => void; }> = ({ onCTAClick }) => (
    <section className="solutions-section">
        <div className="solutions-header">
            <h2>Why <span className="highlight">Clario.ai</span> is Different</h2>
            <p>We built a platform centered on trust, transparency, and quality for your peace of mind.</p>
        </div>
        <div className="solutions-grid">
            <div className="solution-card">
                <div className="solution-card-header">
                    <div className="solution-icon"><AutomationIcon /></div>
                    <h3>Vetted Professionals</h3>
                </div>
                <p>Every expert on our platform is carefully vetted for their credentials, experience, and professionalism.</p>
                <ul className="solution-features-list">
                    <li><CheckIcon /> Verified credentials (CPA, EA, etc.)</li>
                    <li><CheckIcon /> Background and reference checks</li>
                    <li><CheckIcon /> Proven track record of success</li>
                </ul>
            </div>
            <div className="solution-card">
                <div className="solution-card-header">
                    <div className="solution-icon"><TaxComplianceIcon /></div>
                    <h3>Transparent Pricing</h3>
                </div>
                <p>No hidden fees or surprises. See hourly rates and project prices upfront before you even start a conversation.</p>
                 <ul className="solution-features-list">
                    <li><CheckIcon /> Fixed-price project options</li>
                    <li><CheckIcon /> Clear hourly rates</li>
                    <li><CheckIcon /> Agree on scope before work begins</li>
                </ul>
            </div>
            <div className="solution-card">
                <div className="solution-card-header">
                    <div className="solution-icon"><CashFlowIcon /></div>
                    <h3>Secure & Simple Platform</h3>
                </div>
                <p>Manage communication, file sharing, and payments all in one secure, easy-to-use place.</p>
                 <ul className="solution-features-list">
                    <li><CheckIcon /> Encrypted messaging</li>
                    <li><CheckIcon /> Secure document storage</li>
                    <li><CheckIcon /> Simple payment processing</li>
                </ul>
            </div>
        </div>
        <div className="solutions-cta">
            <h2>Ready to Find Your Financial Pro?</h2>
            <p>Get the expert help you need to scale your business and reclaim your time.</p>
            <button className="btn-primary btn-large" onClick={onCTAClick}>Browse Experts</button>
        </div>
    </section>
);


const LandingPage: React.FC<{ onLoginClick: () => void; onPrivacyClick: () => void; onFindExpertClick: () => void; onViewExpertProfile: (id: string) => void; onBecomeExpertClick: () => void; }> = ({ onLoginClick, onPrivacyClick, onFindExpertClick, onViewExpertProfile, onBecomeExpertClick }) => (
    <div className="landing-container">
        <header className="landing-header">
            <div className="logo">Clario.ai</div>
            <nav>
                <button className="btn-secondary" onClick={onLoginClick}>Log In</button>
                <button className="btn-primary" onClick={onBecomeExpertClick}>Become an Expert</button>
            </nav>
        </header>
        <main>
            <section className="hero-section">
                <h1>Stop Juggling Books. Hire the Right Financial Expert, Right Now.</h1>
                <p>Clario.ai is the trusted marketplace for solopreneurs to connect with top-rated bookkeepers, CPAs, and tax advisors.</p>
                <button className="btn-primary btn-large" onClick={onFindExpertClick}>Find Your Expert</button>
            </section>
            <HowItWorksSection />
            <FeaturedExpertsSection experts={mockExperts} onSelectExpert={onViewExpertProfile} />
            <WhyClarioSection onCTAClick={onFindExpertClick} />
        </main>
        <footer className="landing-footer">
            <div className="footer-links">
                <a href="#" onClick={(e) => { e.preventDefault(); onPrivacyClick(); }}>Privacy Policy</a>
            </div>
            <p>&copy; 2025 Clario.ai. All rights reserved.</p>
        </footer>
    </div>
);

const LoginPage: React.FC<{
    onLogin: (email: string, pass: string) => Promise<void>;
    onSignUp: (email: string, pass: string) => Promise<void>;
}> = ({ onLogin, onSignUp }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        if (email && password) {
            try {
                if (isSignUp) {
                    await onSignUp(email, password);
                } else {
                    await onLogin(email, password);
                }
            } catch (err: any) {
                // Firebase provides user-friendly error messages
                setError(err.message.replace('Firebase: ', ''));
            }
        }
        setIsLoading(false);
    };

    return (
        <div className="login-page">
            <div className="login-content card">
                <h1>{isSignUp ? 'Create an Account' : 'Login to Clario.ai'}</h1>
                <p>Enter your details to access your dashboard.</p>
                {error && <div className="error-message" style={{marginBottom: '1rem', color: 'var(--danger-color)'}}>{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group full-width">
                        <label htmlFor="email">Email Address</label>
                        <input
                            type="email" id="email" value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com" required disabled={isLoading}
                        />
                    </div>
                     <div className="form-group full-width">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password" id="password" value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••" required disabled={isLoading}
                        />
                    </div>
                    <button className="btn-primary btn-large" type="submit" disabled={isLoading}>
                        {isLoading ? <span className="loader"/> : (isSignUp ? 'Sign Up' : 'Log In')}
                    </button>
                </form>
                 <p style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
                    {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setIsSignUp(!isSignUp); setError(''); }} style={{color: 'var(--primary-color)', textDecoration: 'none'}}>
                        {isSignUp ? 'Log In' : 'Sign Up'}
                    </a>
                </p>
            </div>
        </div>
    );
};

const PrivacyPolicyPage: React.FC<{ onBack: () => void; }> = ({ onBack }) => (
    <div className="static-page-container">
         <header className="landing-header">
            <div className="logo">Clario.ai</div>
            <nav>
                <button className="btn-secondary" onClick={onBack}>Back to Home</button>
            </nav>
        </header>
        <main className="static-page-content">
            <h1>Privacy Policy</h1>
            <p><em>Last Updated: September 5, 2025</em></p>

            <section>
                <h2>1. Introduction</h2>
                <p>Welcome to Clario.ai. We are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our application. Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the application.</p>
            </section>
            
            <section>
                <h2>2. Collection of Your Information</h2>
                <p>We may collect information about you in a variety of ways. The information we may collect via the Application includes:</p>
                <ul>
                    <li><strong>Personal Data:</strong> Personally identifiable information, such as your name, email address, that you voluntarily give to us when you register with the Application.</li>
                    <li><strong>Financial Data:</strong> Financial information, such as data related to your transactions, invoices, bills, and tax calculations that you input into the application. This data is stored securely and is used solely to provide the bookkeeping services offered.</li>
                </ul>
            </section>
            
            <section>
                <h2>3. Use of Your Information</h2>
                <p>Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you via the Application to:</p>
                 <ul>
                    <li>Create and manage your account.</li>
                    <li>Process your transactions and perform bookkeeping services.</li>
                    <li>Provide you with tax estimations and financial summaries.</li>
                    <li>Email you regarding your account or order.</li>
                </ul>
            </section>

            <section>
                <h2>4. Security of Your Information</h2>
                <p>We use administrative, technical, and physical security measures to help protect your personal information. While we have taken reasonable steps to secure the personal information you provide to us, please be aware that despite our efforts, no security measures are perfect or impenetrable, and no method of data transmission can be guaranteed against any interception or other type of misuse.</p>
            </section>

            <section>
                <h2>5. Contact Us</h2>
                <p>If you have questions or comments about this Privacy Policy, please contact us at: privacy@clario.ai</p>
            </section>
        </main>
    </div>
);

const PublicExpertProfilePage: React.FC<{ expert: Expert; onBack: () => void; onContact: () => void; onPrivacyClick: () => void; }> = ({ expert, onBack, onContact, onPrivacyClick }) => (
    <div className="landing-container">
        <header className="landing-header">
            <div className="logo">Clario.ai</div>
            <nav>
                 <button className="btn-secondary" onClick={onBack}>Back to Home</button>
                 <button className="btn-primary" onClick={onContact}>Log In to Hire</button>
            </nav>
        </header>
        <main>
             <div className="expert-profile-view public-view">
                <ExpertProfileLayout expert={expert} onHire={onContact} isPublic={true} />
            </div>
        </main>
        <footer className="landing-footer">
            <div className="footer-links">
                <a href="#" onClick={(e) => { e.preventDefault(); onPrivacyClick(); }}>Privacy Policy</a>
            </div>
            <p>&copy; 2025 Clario.ai. All rights reserved.</p>
        </footer>
    </div>
);

const ExpertSignupFlow: React.FC<{
    onComplete: (data: Omit<Expert, 'id' | 'rating' | 'reviewCount' | 'reviews' | 'verified' | 'responseTime' | 'joinedDate' | 'profileImageUrl'>) => void;
    onBackToHome: () => void;
}> = ({ onComplete, onBackToHome }) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        name: '',
        title: '',
        location: '',
        hourlyRate: 75,
        bio: '',
        skills: [] as string[],
        services: [{ name: '', description: '', price: '' }],
    });
    const [currentSkill, setCurrentSkill] = useState('');

    const nextStep = () => setStep(s => s + 1);
    const prevStep = () => setStep(s => s - 1);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({...prev, hourlyRate: parseInt(e.target.value, 10) }));
    }

    const handleAddSkill = () => {
        if (currentSkill && !formData.skills.includes(currentSkill)) {
            setFormData(prev => ({...prev, skills: [...prev.skills, currentSkill]}));
            setCurrentSkill('');
        }
    };

    const handleRemoveSkill = (skillToRemove: string) => {
        setFormData(prev => ({...prev, skills: prev.skills.filter(s => s !== skillToRemove)}));
    };

    const handleServiceChange = (index: number, field: 'name' | 'description' | 'price', value: string) => {
        const newServices = [...formData.services];
        newServices[index][field] = value;
        setFormData(prev => ({ ...prev, services: newServices }));
    };

    const addService = () => {
        setFormData(prev => ({ ...prev, services: [...prev.services, { name: '', description: '', price: '' }] }));
    };
    
    const removeService = (index: number) => {
        if (formData.services.length > 1) {
            const newServices = formData.services.filter((_, i) => i !== index);
            setFormData(prev => ({ ...prev, services: newServices }));
        }
    };
    
    const handleSubmit = () => {
        onComplete(formData);
    }
    
    const steps = [
        { title: "Basic Info", id: 1 },
        { title: "Profile Details", id: 2 },
        { title: "Services", id: 3 },
        { title: "Review", id: 4 },
    ];

    return (
        <div className="signup-flow-container">
            <header className="landing-header">
                <div className="logo">Clario.ai Expert Signup</div>
                <button className="btn-secondary" onClick={onBackToHome}>Cancel</button>
            </header>
            <div className="signup-flow-content">
                <div className="progress-bar">
                    {steps.map((s, index) => (
                        <React.Fragment key={s.id}>
                           <div className={`progress-step ${step >= s.id ? 'active' : ''}`}>
                                <div className="step-circle">{s.id}</div>
                                <span>{s.title}</span>
                            </div>
                           {index < steps.length - 1 && <div className={`progress-line ${step > s.id ? 'active' : ''}`} />}
                        </React.Fragment>
                    ))}
                </div>
                
                <div className="signup-step-card">
                    {step === 1 && (
                        <div>
                            <h2>Tell us about yourself</h2>
                            <p>This information will be displayed on your public profile.</p>
                            <div className="form-group"><label>Full Name</label><input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="e.g., Jane Doe" required /></div>
                            <div className="form-group"><label>Professional Title</label><input type="text" name="title" value={formData.title} onChange={handleChange} placeholder="e.g., Certified Public Accountant" required /></div>
                            <div className="form-group"><label>Location</label><input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="e.g., New York, NY" required /></div>
                            <div className="form-group">
                                <label>Your Hourly Rate (${formData.hourlyRate}/hr)</label>
                                <input type="range" name="hourlyRate" min="25" max="300" step="5" value={formData.hourlyRate} onChange={handleRateChange} />
                            </div>
                        </div>
                    )}
                    {step === 2 && (
                        <div>
                            <h2>Showcase your expertise</h2>
                            <p>Write a compelling bio and list the skills that make you stand out.</p>
                            <div className="form-group"><label>Biography</label><textarea name="bio" value={formData.bio} onChange={handleChange} placeholder="Describe your experience, specialty, and what makes you a great partner for small businesses." rows={6} required /></div>
                            <div className="form-group">
                                <label>Skills</label>
                                <div className="skill-input-group">
                                    <input type="text" value={currentSkill} onChange={(e) => setCurrentSkill(e.target.value)} placeholder="e.g., Tax Planning" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddSkill())} />
                                    <button type="button" onClick={handleAddSkill}>Add</button>
                                </div>
                                <div className="skills-display">
                                    {formData.skills.map(skill => (
                                        <span key={skill} className="skill-tag">{skill} <button onClick={() => handleRemoveSkill(skill)}>&times;</button></span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    {step === 3 && (
                        <div>
                            <h2>Define your services</h2>
                            <p>List the specific services you offer. You can add fixed-price projects or describe your hourly offerings.</p>
                            {formData.services.map((service, index) => (
                                <div className="service-entry-form" key={index}>
                                     <h4>Service #{index + 1}</h4>
                                     <div className="form-group"><label>Service Name</label><input type="text" value={service.name} onChange={(e) => handleServiceChange(index, 'name', e.target.value)} placeholder="e.g., Monthly Bookkeeping" required /></div>
                                     <div className="form-group"><label>Description</label><textarea value={service.description} onChange={(e) => handleServiceChange(index, 'description', e.target.value)} placeholder="Briefly describe what's included in this service." rows={3} required /></div>
                                     <div className="form-group"><label>Price</label><input type="text" value={service.price} onChange={(e) => handleServiceChange(index, 'price', e.target.value)} placeholder="e.g., $450/month or $1,200 one-time" required /></div>
                                     {formData.services.length > 1 && <button type="button" className="btn-remove-service" onClick={() => removeService(index)}>Remove Service</button>}
                                </div>
                            ))}
                            <button type="button" className="btn-add-service" onClick={addService}>+ Add Another Service</button>
                        </div>
                    )}
                    {step === 4 && (
                        <div>
                             <h2>Review your profile</h2>
                             <p>This is how your profile will appear to clients. Go back to make any changes.</p>
                             <div className="profile-preview-card">
                                 <ExpertProfileLayout expert={{
                                     ...formData,
                                     id: 'preview',
                                     profileImageUrl: 'https://i.pravatar.cc/150?img=10', // Placeholder
                                     rating: 0,
                                     reviewCount: 0,
                                     reviews: [],
                                     verified: false,
                                     responseTime: 'New Expert!',
                                     joinedDate: new Date().toISOString()
                                 }} onHire={() => {}} isPublic={true} />
                             </div>
                        </div>
                    )}
                     <div className="signup-navigation">
                        {step > 1 && <button className="btn-secondary" onClick={prevStep}>Previous Step</button>}
                        {step < 4 && <button className="btn-primary" onClick={nextStep}>Next Step</button>}
                        {step === 4 && <button className="btn-primary" onClick={handleSubmit}>Submit Application</button>}
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- Bookkeeping App Component ---
const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<Account[]>(initialChartOfAccounts);
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [bankStatementData, setBankStatementData] = useState<string>('');
  const [reconciliationResults, setReconciliationResults] = useState<ReconciliationResults | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState<boolean>(false);
  const [isHireModalOpen, setIsHireModalOpen] = useState<boolean>(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'q1' | 'q2' | 'q3' | 'q4' | 'ytd'>('ytd');
  const [isBillingOpen, setIsBillingOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [experts, setExperts] = useState<Expert[]>(mockExperts);
  const [viewingExpertId, setViewingExpertId] = useState<string | null>(null);


  // State for Tax Agent
  const [seTaxRate, setSeTaxRate] = useState<number>(15.3);
  const [salesTaxRate, setSalesTaxRate] = useState<number>(7.0);
  const [irsMileageRate, setIrsMileageRate] = useState<number>(0.67); // 2024 rate
  const [taxQuestion, setTaxQuestion] = useState<string>('');
  const [taxAgentResponse, setTaxAgentResponse] = useState<string>('');
  const [isTaxAgentLoading, setIsTaxAgentLoading] = useState<boolean>(false);
  const [quarterlyPayments, setQuarterlyPayments] = useState<QuarterlyPayments>({ q1: 0, q2: 0, q3: 0, q4: 0 });
    
  // State for VAT
  const [isVatEnabled, setIsVatEnabled] = useState<boolean>(false);
  const [vatRate, setVatRate] = useState<number>(13.0);
    
  // State for Knowledge Base
  const [knowledgeBaseAnswer, setKnowledgeBaseAnswer] = useState<string>('');
  const [isKnowledgeBaseLoading, setIsKnowledgeBaseLoading] = useState<boolean>(false);


  const hasCheckedRecurring = useRef(false);

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                setAuthState('loggedIn');
                // Reset state on login, as there is no DB persistence
                setTransactions([]);
                setInvoices([]);
                setBills([]);
                setProjects([]);
                setRecurringTransactions([]);
                setChartOfAccounts(initialChartOfAccounts);
                setQuarterlyPayments({q1:0, q2:0, q3:0, q4:0});
            } else {
                setUser(null);
                setAuthState('loggedOut');
                // Reset all state on logout
                setTransactions([]);
                setInvoices([]);
                setBills([]);
                setProjects([]);
                setRecurringTransactions([]);
                setChartOfAccounts(initialChartOfAccounts);
                setQuarterlyPayments({q1:0, q2:0, q3:0, q4:0});
            }
        });
        return () => unsubscribe();
    }, []);


    useEffect(() => {
        // If one of the billing sub-pages is active, ensure the parent menu is open.
        if (['ar', 'ap', 'recurring'].includes(activeTab)) {
            setIsBillingOpen(true);
        }
    }, [activeTab]);

  // Effect to generate recurring transactions on load
    useEffect(() => {
        if (!user || hasCheckedRecurring.current || recurringTransactions.length === 0) {
            return;
        }

        const today = CURRENT_DATE;
        today.setHours(0, 0, 0, 0);

        const newTransactions: Transaction[] = [];
        const updatedRecurring: RecurringTransaction[] = [];
        let needsUpdate = false;

        recurringTransactions.forEach(rec => {
            let recurringCopy = { ...rec };
            let nextDueDate = new Date(recurringCopy.nextDueDate);
            nextDueDate.setHours(0, 0, 0, 0);
            
            let endDate: Date | null = null;
            if (rec.recurringType === 'depreciation' && rec.depreciationPeriodYears && rec.startDate) {
                endDate = new Date(rec.startDate);
                endDate.setFullYear(endDate.getFullYear() + rec.depreciationPeriodYears);
            }

            while (nextDueDate <= today && (!endDate || nextDueDate < endDate)) {
                needsUpdate = true;
                const generatedTx: Transaction = {
                    id: crypto.randomUUID(),
                    ...recurringCopy.details,
                    date: recurringCopy.nextDueDate,
                    reconciled: false,
                };
                newTransactions.push(generatedTx);

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
            updatedRecurring.push(recurringCopy);
        });

        if (needsUpdate) {
            setTransactions(prev => [...newTransactions, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
            setRecurringTransactions(updatedRecurring);
        }

        hasCheckedRecurring.current = true;
    }, [recurringTransactions, user]);


  const handleProcessTransaction = async () => {
    if (!inputText.trim() || isLoading || !user) return;

    setIsLoading(true);
    setError(null);

    const selectedProject = projects.find(p => p.id === activeProjectId);
    const projectContext = selectedProject ? `This transaction is for the project named "${selectedProject.name}". ` : '';
    const accountList = chartOfAccounts.map(a => a.name).join(', ');

    const vatContext = isVatEnabled ? `VAT (Value-Added Tax) is enabled at a rate of ${vatRate}%. For sales transactions (income), calculate the VAT and include it as a credit to 'VAT Payable'. This is output VAT. For expense transactions, calculate the input VAT and include it as a debit to 'VAT Payable'. The main transaction 'amount' should be the pre-VAT amount. The total transaction value will be amount + VAT. The journal entry must balance.` : 'VAT processing is disabled.';

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `The current date is September 5, 2025. ${projectContext}${vatContext} From the text below, extract all financial transactions. Provide a standard double-entry journal using ONLY accounts from this list: [${accountList}]. For 'category', use the exact expense account name. Classify each transaction as 'business' or 'personal'. Text: "${inputText}"`,
        config: {
          systemInstruction: "You are an expert bookkeeper. You MUST use accounts from the provided Chart of Accounts. For a cash receipt from a customer, determine if it is new revenue or a settlement of Accounts Receivable. For a bill to be paid later, credit 'Accounts Payable'. If VAT is enabled, you MUST correctly calculate and journalize it, ensuring the 'amount' field is pre-tax.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    vendor: { type: Type.STRING },
                    amount: { type: Type.NUMBER, description: "The pre-tax amount of the transaction." },
                    vatAmount: { type: Type.NUMBER, description: "The calculated VAT amount. Omit if not applicable." },
                    vatType: { type: Type.STRING, description: "Either 'input' (for expenses) or 'output' (for income)." },
                    currency: { type: Type.STRING },
                    date: { type: Type.STRING },
                    category: { type: Type.STRING },
                    transactionType: { type: Type.STRING },
                    classification: { type: Type.STRING },
                    deductible: { type: Type.BOOLEAN },
                    miles: { type: Type.NUMBER },
                    journal: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                account: { type: Type.STRING },
                                debit: { type: Type.NUMBER },
                                credit: { type: Type.NUMBER },
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
      if (!responseText) throw new Error("The AI returned an empty response.");
      
      const parsedTransactions = JSON.parse(responseText) as Omit<Transaction, 'id'>[];
      
      const tempNewTxs: Transaction[] = [];
      const tempNewBills: Bill[] = [];
      const tempNewInvoices: Invoice[] = [];

      parsedTransactions.forEach(t => {
          // The total amount recorded against bank/AR/AP should include VAT
          const totalAmount = t.amount + (t.vatAmount || 0);

          const newTxId = crypto.randomUUID();
          const newTxData: Transaction = {
              id: newTxId,
              ...t,
              reconciled: false,
              ...(activeProjectId && { projectId: activeProjectId }),
              classification: t.classification === 'personal' ? 'personal' : 'business'
          };
          tempNewTxs.push(newTxData);

          const isBill = newTxData.journal.some(j => j.account === 'Accounts Payable' && j.credit);
          const isInvoice = newTxData.journal.some(j => j.account === 'Accounts Receivable' && j.debit);

          if (isBill) {
              const dueDate = new Date(newTxData.date);
              dueDate.setDate(dueDate.getDate() + 30);
              const newBillData: Bill = {
                  id: crypto.randomUUID(),
                  vendor: newTxData.vendor, billNumber: `B-${Date.now()}`, billDate: newTxData.date,
                  dueDate: dueDate.toISOString().split('T')[0], amount: totalAmount, status: 'Open' as 'Open',
                  relatedTransactionId: newTxId
              };
              tempNewBills.push(newBillData);
          }
          if (isInvoice) {
              const dueDate = new Date(newTxData.date);
              dueDate.setDate(dueDate.getDate() + 30);
              const newInvData: Invoice = {
                  id: crypto.randomUUID(),
                  customer: newTxData.vendor, invoiceNumber: `INV-${Date.now()}`, invoiceDate: newTxData.date,
                  dueDate: dueDate.toISOString().split('T')[0], amount: totalAmount, status: 'Sent' as 'Sent',
                  relatedTransactionId: newTxId, taxable: !!t.vatAmount,
              };
              tempNewInvoices.push(newInvData);
          }
      });
      
      setTransactions(prev => [...tempNewTxs, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      if (tempNewBills.length > 0) setBills(prev => [...tempNewBills, ...prev]);
      if (tempNewInvoices.length > 0) setInvoices(prev => [...tempNewInvoices, ...prev]);
      setInputText('');

    } catch (e: any) {
      console.error(e);
      let friendlyMessage = "An unexpected error occurred. Please try again.";
      if (e instanceof Error) {
          friendlyMessage = e.message.includes("API key") ? "Configuration issue with the AI service." : e.message;
      }
      setError(`Failed to process transaction. ${friendlyMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this transaction?')) {
        setTransactions(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleToggleTransactionClassification = async (transactionId: string) => {
    const tx = transactions.find(t => t.id === transactionId);
    if (!tx) return;
    const newClassification = tx.classification === 'business' ? 'personal' : 'business';
    setTransactions(prev => prev.map(t => t.id === transactionId ? { ...t, classification: newClassification } : t));
  };

  const handleOpenEditModal = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsEditModalOpen(true);
  };

  const handleUpdateTransaction = async (updatedTransaction: Transaction) => {
    setTransactions(prev => prev.map(t => t.id === updatedTransaction.id ? {...updatedTransaction, classification: updatedTransaction.classification as 'business' | 'personal'} : t).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setIsEditModalOpen(false);
    setEditingTransaction(null);
  };

  const handleReconcile = () => { /* This remains a client-side only feature for now */ };

  const handleCreateInvoice = async (invoiceData: Omit<Invoice, 'id' | 'status' | 'relatedTransactionId'> & { projectId?: string }) => {
    const txId = crypto.randomUUID();
    let journal: JournalEntry[];
    let vatAmt = 0;
    let totalAmount = invoiceData.amount;

    if (isVatEnabled && invoiceData.taxable) {
        vatAmt = invoiceData.amount * (vatRate / 100);
        totalAmount += vatAmt;
        journal = [
            { account: 'Accounts Receivable', debit: totalAmount },
            { account: 'Sales Revenue', credit: invoiceData.amount },
            { account: 'VAT Payable', credit: vatAmt }
        ];
    } else {
        journal = [
            { account: 'Accounts Receivable', debit: invoiceData.amount },
            { account: 'Sales Revenue', credit: invoiceData.amount }
        ];
    }

    const newTransactionData: Transaction = {
        id: txId,
        vendor: invoiceData.customer, amount: invoiceData.amount, currency: 'USD', date: invoiceData.invoiceDate,
        category: 'Sales', transactionType: 'income', classification: 'business',
        journal,
        reconciled: false,
        projectId: invoiceData.projectId,
        vatAmount: vatAmt > 0 ? vatAmt : undefined,
        vatType: vatAmt > 0 ? 'output' : undefined
    };
    
    const newInvoiceData: Invoice = {
        id: crypto.randomUUID(),
        customer: invoiceData.customer,
        invoiceNumber: invoiceData.invoiceNumber,
        invoiceDate: invoiceData.invoiceDate,
        dueDate: invoiceData.dueDate,
        amount: totalAmount, // The total amount owed by the customer
        taxable: invoiceData.taxable,
        status: 'Draft',
        relatedTransactionId: txId
    };

    setTransactions(prev => [newTransactionData, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setInvoices(prev => [newInvoiceData, ...prev]);
    setIsInvoiceModalOpen(false);
  };

  const handleUpdateInvoiceStatus = async (invoiceId: string, status: 'Sent' | 'Paid') => {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) return;

      if (status === 'Paid' && invoice.status !== 'Paid') {
          const settlementTransactionData: Transaction = {
              id: crypto.randomUUID(),
              vendor: invoice.customer, amount: invoice.amount, currency: 'USD', date: CURRENT_DATE_ISO,
              category: 'Payment', transactionType: 'income', classification: 'business',
              journal: [{ account: 'Bank', debit: invoice.amount }, { account: 'Accounts Receivable', credit: invoice.amount }],
              reconciled: false
          };
          setTransactions(prev => [settlementTransactionData, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? {...inv, status} : inv));
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (window.confirm('Are you sure you want to delete this invoice and its related transaction?')) {
        const invoiceToDelete = invoices.find(inv => inv.id === invoiceId);
        if (invoiceToDelete) {
            setTransactions(prev => prev.filter(t => t.id !== invoiceToDelete.relatedTransactionId));
            setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
        }
    }
  };

  const handleCreateBill = async (billData: Omit<Bill, 'id' | 'status' | 'relatedTransactionId'> & { projectId?: string, vatAmount?: number }) => {
        const expenseAccount = 'Miscellaneous Expense';
        const txId = crypto.randomUUID();
        let journal: JournalEntry[];
        let totalAmount = billData.amount;

        if (isVatEnabled && billData.vatAmount && billData.vatAmount > 0) {
            totalAmount += billData.vatAmount;
            journal = [
                { account: expenseAccount, debit: billData.amount },
                { account: 'VAT Payable', debit: billData.vatAmount },
                { account: 'Accounts Payable', credit: totalAmount }
            ];
        } else {
            journal = [
                { account: expenseAccount, debit: billData.amount },
                { account: 'Accounts Payable', credit: billData.amount }
            ];
        }

        const newTransactionData: Transaction = {
            id: txId,
            vendor: billData.vendor, amount: billData.amount, currency: 'USD', date: billData.billDate,
            category: 'Bill', transactionType: 'expense', classification: 'business',
            journal,
            reconciled: false,
            projectId: billData.projectId,
            vatAmount: billData.vatAmount,
            vatType: billData.vatAmount ? 'input' : undefined
        };

        const newBillData: Bill = {
            id: crypto.randomUUID(),
            vendor: billData.vendor,
            billNumber: billData.billNumber,
            billDate: billData.billDate,
            dueDate: billData.dueDate,
            amount: totalAmount, // Total amount to be paid
            status: 'Open',
            relatedTransactionId: txId
        };
        
        setTransactions(prev => [newTransactionData, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setBills(prev => [newBillData, ...prev]);
        setIsBillModalOpen(false);
    };

    const handleUpdateBillStatus = async (billId: string, status: 'Paid') => {
        const bill = bills.find(b => b.id === billId);
        if (!bill || bill.status === 'Paid') return;
        
        const paymentTransactionData: Transaction = {
            id: crypto.randomUUID(),
            vendor: bill.vendor, amount: bill.amount, currency: 'USD', date: CURRENT_DATE_ISO,
            category: 'Payment', transactionType: 'expense', classification: 'business',
            journal: [{ account: 'Accounts Payable', debit: bill.amount }, { account: 'Bank', credit: bill.amount }],
            reconciled: false
        };

        setTransactions(prev => [paymentTransactionData, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setBills(prev => prev.map(b => b.id === billId ? { ...b, status } : b));
    };

    const handleDeleteBill = async (billId: string) => {
        if (window.confirm('Are you sure you want to delete this bill and its related transaction?')) {
            const billToDelete = bills.find(b => b.id === billId);
            if (billToDelete) {
                setTransactions(prev => prev.filter(t => t.id !== billToDelete.relatedTransactionId));
                setBills(prev => prev.filter(b => b.id !== billId));
            }
        }
    };


  const handleAddProject = async (projectName: string) => {
    if (projectName.trim()) {
        const newProject: Project = { name: projectName.trim(), id: crypto.randomUUID() };
        setProjects(prev => [...prev, newProject]);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (window.confirm('Are you sure you want to delete this project? This will not delete associated transactions.')) {
        setProjects(prev => prev.filter(p => p.id !== projectId));
    }
  };

  const handleAddRecurringTransaction = async (newRecurring: Omit<RecurringTransaction, 'id'>) => {
      const newRecWithId = { ...newRecurring, id: crypto.randomUUID() };
      setRecurringTransactions(prev => [...prev, newRecWithId]);
  };

  const handleDeleteRecurringTransaction = async (id: string) => {
      if (window.confirm('Are you sure you want to delete this recurring transaction schedule?')) {
          setRecurringTransactions(prev => prev.filter(rt => rt.id !== id));
      }
  };

  const handleAddAccount = async (account: Account) => {
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
                // P&L calculation should be based on the net amount (pre-tax)
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
             const originalTx = businessTransactions.find(t => t.id === inv.relatedTransactionId);
             if (originalTx && inv.taxable && !isVatEnabled) {
                const quarter = getQuarter(originalTx.date);
                periods[quarter].taxableSales += originalTx.amount;
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
        
        // VAT Calculation
        const vatSummary: VATSummary = businessTransactions.reduce((acc, tx) => {
            if (tx.vatType === 'output' && tx.vatAmount) {
                acc.totalOutputVAT += tx.vatAmount;
            } else if (tx.vatType === 'input' && tx.vatAmount) {
                acc.totalInputVAT += tx.vatAmount;
            }
            return acc;
        }, { totalOutputVAT: 0, totalInputVAT: 0, netVatPayable: 0 });

        vatSummary.netVatPayable = vatSummary.totalOutputVAT - vatSummary.totalInputVAT;

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
            },
            vat: vatSummary
        };
    }, [transactions, invoices, seTaxRate, salesTaxRate, irsMileageRate, quarterlyPayments, chartOfAccounts, isVatEnabled, vatRate]);

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
            - Net VAT Payable: $${financials.vat.netVatPayable.toFixed(2)}

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
    
    const handleAskKnowledgeBase = async (question: string) => {
        if (!question.trim() || isKnowledgeBaseLoading) return;

        setIsKnowledgeBaseLoading(true);
        setKnowledgeBaseAnswer('');

        // Prepare a more detailed context for general financial questions
        const projectProfitability = projects.map(p => {
            const projectTxs = transactions.filter(t => t.projectId === p.id && t.classification === 'business');
            const income = projectTxs.filter(t => t.transactionType === 'income').reduce((sum, t) => sum + t.amount, 0);
            const expenses = projectTxs.filter(t => t.transactionType === 'expense').reduce((sum, t) => sum + t.amount, 0);
            return `- Project '${p.name}': Income $${income.toFixed(2)}, Expenses $${expenses.toFixed(2)}, Net $${(income - expenses).toFixed(2)}`;
        }).join('\n');

        const topExpenses = Object.entries(financials.ytd.accountTotals)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([name, amount]) => `- ${name}: $${amount.toFixed(2)}`)
            .join('\n');

        const financialContext = `
            Current Financial Summary (Year-to-Date):
            - Total Income: $${financials.ytd.income.toFixed(2)}
            - Total Expenses: $${financials.ytd.expenses.toFixed(2)}
            - Net Profit: $${financials.ytd.net.toFixed(2)}
            
            Top 5 Expense Categories:
            ${topExpenses || 'No expenses recorded.'}

            Project Profitability Summary:
            ${projectProfitability || 'No projects with financial data.'}

            User's Question: "${question}"
        `;

        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: financialContext,
                config: {
                    systemInstruction: "You are an expert financial analyst AI for small businesses. Your role is to answer questions based *only* on the provided financial data. Provide clear, concise, and data-driven answers. Format your answers clearly using headings or bullet points where appropriate. If the data doesn't support an answer, state that clearly. Do not provide financial advice or make up information not present in the summary.",
                },
            });
            setKnowledgeBaseAnswer(response.text);
        } catch (e) {
            console.error(e);
            setKnowledgeBaseAnswer("Sorry, I encountered an error while processing your request. Please try again.");
        } finally {
            setIsKnowledgeBaseLoading(false);
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
    
    const handleViewExpert = (expertId: string) => {
        setViewingExpertId(expertId);
    };
    
    const handleOpenHireModal = () => {
        setIsHireModalOpen(true);
    };

    const handleSendHireRequest = (details: { title: string; description: string }) => {
        const expert = experts.find(e => e.id === viewingExpertId);
        alert(`Hiring request for "${details.title}" sent to ${expert?.name}!`);
        setIsHireModalOpen(false);
    };

    const handleCompleteExpertSignup = (data: Omit<Expert, 'id' | 'rating' | 'reviewCount' | 'reviews' | 'verified' | 'responseTime' | 'joinedDate' | 'profileImageUrl'>) => {
        const newExpert: Expert = {
            ...data,
            id: crypto.randomUUID(),
            rating: 0,
            reviewCount: 0,
            reviews: [],
            verified: false,
            responseTime: 'New Expert!',
            joinedDate: new Date().toISOString(),
            profileImageUrl: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70)}`, // Random image
        };
        setExperts(prev => [newExpert, ...prev]);
        
        // For demo purposes, we'll log them in and take them to the expert list
        // In a real app, this would involve creating a user account
        setAuthState('loggedIn');
        setActiveTab('findExperts');
    };

  const renderContent = () => {
    if (viewingExpertId) {
        const expert = experts.find(e => e.id === viewingExpertId);
        if (expert) {
            return <ExpertProfileView expert={expert} onBack={() => setViewingExpertId(null)} onHire={handleOpenHireModal} />;
        }
    }

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
        case 'findExperts':
            return <FindExpertsView experts={experts} onViewExpert={handleViewExpert} />;
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
        case 'knowledge':
            return <KnowledgeBaseView 
                onAsk={handleAskKnowledgeBase}
                answer={knowledgeBaseAnswer}
                isLoading={isKnowledgeBaseLoading}
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
                isVatEnabled={isVatEnabled}
                setIsVatEnabled={setIsVatEnabled}
                vatRate={vatRate}
                setVatRate={setVatRate}
            />;
        case 'recurring':
            return <RecurringView
                recurringTransactions={recurringTransactions}
                handleAddRecurringTransaction={handleAddRecurringTransaction}
                handleDeleteRecurringTransaction={handleDeleteRecurringTransaction}
                chartOfAccounts={chartOfAccounts}
            />;
        case 'journal':
            return <JournalView transactions={transactions} />;
        case 'coa':
            return <COAView chartOfAccounts={chartOfAccounts} onAddAccount={handleAddAccount} />;
        default:
            return null;
    }
  }

  const handleLogin = async (email: string, pass: string) => {
      await signInWithEmailAndPassword(auth, email, pass);
  };

  const handleSignUp = async (email: string, pass: string) => {
      await createUserWithEmailAndPassword(auth, email, pass);
      // No initial data is created in DB anymore, local state handles it.
      setChartOfAccounts(initialChartOfAccounts);
  };

  const handleLogout = () => {
      signOut(auth);
  };
    
  const handleViewPublicProfile = (expertId: string) => {
    setViewingExpertId(expertId);
    setAuthState('viewingPublicProfile');
  };


  if (authState === 'loading') {
      return <div className="loading-fullscreen"></div>; // Replace with a proper loading spinner/UI
  }
    
  if (authState === 'viewingPublicProfile') {
        const expert = experts.find(e => e.id === viewingExpertId);
        if (expert) {
            return <PublicExpertProfilePage 
                        expert={expert} 
                        onBack={() => { setViewingExpertId(null); setAuthState('loggedOut'); }}
                        onContact={() => setAuthState('loggingIn')}
                        onPrivacyClick={() => setAuthState('viewingPrivacy')}
                    />;
        } else {
            // Fallback if expert ID is invalid, go back to landing
            setAuthState('loggedOut');
            return null;
        }
    }

  if (authState === 'viewingPrivacy') {
      return <PrivacyPolicyPage onBack={() => setAuthState(user ? 'loggedIn' : 'loggedOut')} />;
  }

  if (authState === 'expertSignup') {
        return <ExpertSignupFlow onComplete={handleCompleteExpertSignup} onBackToHome={() => setAuthState('loggedOut')} />;
  }
  
  if (authState === 'loggedOut' || authState === 'loggingIn') {
      const handleFindExpertClick = () => {
          setAuthState('loggingIn');
      };
      return authState === 'loggedOut' ? 
        <LandingPage 
            onLoginClick={() => setAuthState('loggingIn')} 
            onPrivacyClick={() => setAuthState('viewingPrivacy')} 
            onFindExpertClick={handleFindExpertClick}
            onViewExpertProfile={handleViewPublicProfile}
            onBecomeExpertClick={() => setAuthState('expertSignup')}
        /> :
        <LoginPage onLogin={handleLogin} onSignUp={handleSignUp} />;
  }
  
  const handleSetActiveTab = (tab: ActiveTab) => {
    setViewingExpertId(null); // Clear expert view when changing main tabs
    setActiveTab(tab);
  };
    
  const expertToHire = experts.find(e => e.id === viewingExpertId);

  return (
    <div className="app-layout">
        <Sidebar
            activeTab={activeTab}
            setActiveTab={handleSetActiveTab}
            isBillingOpen={isBillingOpen}
            setIsBillingOpen={setIsBillingOpen}
        />
       <div className="main-wrapper">
            <Header
              userEmail={user?.email || null}
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
        {isInvoiceModalOpen && <InvoiceModal onClose={() => setIsInvoiceModalOpen(false)} onCreate={handleCreateInvoice} projects={projects} isVatEnabled={isVatEnabled} vatRate={vatRate} />}
        {isBillModalOpen && <BillModal onClose={() => setIsBillModalOpen(false)} onCreate={handleCreateBill} projects={projects} isVatEnabled={isVatEnabled} />}
        {isHireModalOpen && expertToHire && (
            <HireExpertModal
                expertName={expertToHire.name}
                onClose={() => setIsHireModalOpen(false)}
                onSubmit={handleSendHireRequest}
            />
        )}
    </div>
  );
};

// --- Helper Functions ---
// No longer needed as we don't fetch from Firestore
// async function getCollectionData<T extends DocumentData>(userId: string, collectionName: string): Promise<T[]> { ... }


// --- Icons ---
const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const TransactionsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><line x1="17" x2="7" y1="7" y2="7"/><line x1="17" x2="7" y1="17" y2="17"/></svg>;
const BillingIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M2 8h20"/><path d="M6 12h4"/></svg>;
const JournalIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>;
const ChartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>;
const ProjectsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>;
const KnowledgeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20v-2H6.5A2.5 2.5 0 0 1 4 12.5v-5A2.5 2.5 0 0 1 6.5 5H20V3H6.5A2.5 2.5 0 0 1 4 .5"/><path d="M2 3h2"/><path d="M2 7h2"/><path d="M2 11h2"/><path d="M2 15h2"/></svg>;
const TaxIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.21 15.89-1.21-1.21a2 2 0 0 0-2.83 0l-1.18 1.18a2 2 0 0 1-2.83 0l-2.24-2.24a2 2 0 0 1 0-2.83l1.18-1.18a2 2 0 0 0 0-2.83l-1.21-1.21a2 2 0 0 0-2.83 0L2.1 12.89a2 2 0 0 0 0 2.83l8.49 8.48a2 2 0 0 0 2.83 0l8.48-8.48a2 2 0 0 0 0-2.83z"/><path d="M5.7 14.3 2.1 10.7a2 2 0 0 1 0-2.83l5.66-5.66a2 2 0 0 1 2.83 0l5.66 5.66a2 2 0 0 1 0 2.83l-5.66 5.66a2 2 0 0 1-2.83 0z"/></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
const ChevronDownIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>;
const UsersIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const StarIcon = ({ filled }: { filled: boolean }) => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const CalendarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const BriefcaseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
const ShopifyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.2 7.8c2.4 2.4 2.4 6.4 0 8.8-2.4 2.4-6.4 2.4-8.8 0-2.4-2.4-2.4-6.4 0-8.8 2.4-2.4 6.4-2.4 8.8 0z"/><path d="M11 12H8"/><path d="M11 12h5c0-2.8-2.2-5-5-5s-5 2.2-5 5h5z"/></svg>;
const ExportIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;


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
                    <li><a href="#" className={activeTab === 'findExperts' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('findExperts'); }}><UsersIcon /> Find Experts</a></li>
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
                    <li><a href="#" className={activeTab === 'knowledge' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('knowledge'); }}><KnowledgeIcon /> Knowledge Base</a></li>
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
    activeProjectId: string | undefined,
    setActiveProjectId: (id: string | undefined) => void,
    projects: Project[],
    handleProcessTransaction: () => void,
    error: string | null,
    bankStatementData: string,
    setBankStatementData: (data: string) => void,
    handleReconcile: () => void,
    reconciliationResults: ReconciliationResults | null,
    handleOpenEditModal: (t: Transaction) => void,
    handleDeleteTransaction: (id: string) => void,
    handleToggleTransactionClassification: (id: string) => void,
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
                    onChange={e => setActiveProjectId(e.target.value ? e.target.value : undefined)}
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

const ExpensePieChart: React.FC<{ data: { name: string; value: number }[]; total: number; }> = ({ data, total }) => {
    if (total === 0 || data.length === 0) {
        return <div className="no-data"><p>No expense data for this period.</p></div>;
    }

    const COLORS = ['#5A32D6', '#8A6FDF', '#B9A9E8', '#6B7280', '#9CA3AF', '#D1D5DB'];
    const radius = 80;
    const strokeWidth = 40;
    const circumference = 2 * Math.PI * radius;

    // We may have more categories than colors, so let's slice and group "Other"
    const MAX_SLICES = COLORS.length - 1;
    let chartData = data;
    if (data.length > COLORS.length) {
        const topItems = data.slice(0, MAX_SLICES);
        const otherValue = data.slice(MAX_SLICES).reduce((acc, item) => acc + item.value, 0);
        chartData = [...topItems, { name: 'Other', value: otherValue }];
    }
    
    let cumulativePercent = 0;

    return (
        <div className="expense-pie-chart-container">
            <svg width="200" height="200" viewBox="0 0 200 200" className="pie-chart-svg">
                <g transform="translate(100,100) rotate(-90)">
                    {chartData.map((item, index) => {
                        const percent = item.value / total;
                        const arcLength = percent * circumference;
                        const rotation = cumulativePercent * 360;
                        cumulativePercent += percent;
                        
                        return (
                             <circle
                                key={item.name}
                                r={radius}
                                cx="0"
                                cy="0"
                                fill="transparent"
                                stroke={COLORS[index % COLORS.length]}
                                strokeWidth={strokeWidth}
                                strokeDasharray={`${arcLength} ${circumference}`}
                                transform={`rotate(${rotation})`}
                            />
                        );
                    })}
                </g>
            </svg>
            <ul className="pie-legend">
                {chartData.map((item, index) => (
                    <li key={item.name}>
                        <span className="legend-color-box" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                        <span className="legend-label">{item.name}</span>
                        <span className="legend-value">${item.value.toFixed(2)} ({((item.value / total) * 100).toFixed(1)}%)</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};


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
        const projectsData: Record<string, { name: string; income: number; expenses: number }> = {};
        projects.forEach(p => {
            projectsData[p.id] = { name: p.name, income: 0, expenses: 0 };
        });

        businessTransactions.forEach(t => {
            if (t.projectId && projectsData[t.projectId]) {
                const isSettlement = t.journal.some(j => (j.account === 'Accounts Receivable' && j.credit) || (j.account === 'Accounts Payable' && j.debit));
                if (isSettlement) return; // Skip cash settlement entries for P&L

                const isAR = t.journal.some(j => j.account === 'Accounts Receivable' && j.debit);
                const isAP = t.journal.some(j => j.account === 'Accounts Payable' && j.credit);

                if (isAR) { // It's an invoice, so it's income
                     projectsData[t.projectId].income += t.amount;
                } else if (isAP) { // It's a bill, so it's an expense
                     projectsData[t.projectId].expenses += t.amount;
                } else if (t.transactionType === 'income' && !isAR) { // Other cash income
                    projectsData[t.projectId].income += t.amount;
                } else if (t.transactionType === 'expense' && !isAP) { // Other cash expense
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

    const handleExportPL = () => {
        const data = financials[selectedPeriod];
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += `Clario.ai Profit & Loss Statement\n`;
        csvContent += `Period: ${selectedPeriod.toUpperCase()}\n\n`;

        csvContent += "Category,Amount\n";
        csvContent += "INCOME\n";
        csvContent += `Total Income,${data.income.toFixed(2)}\n\n`;
        
        csvContent += "EXPENSES\n";
        const expenseDetails = Object.entries(data.accountTotals)
            .sort(([, aVal], [, bVal]) => bVal - aVal);
        expenseDetails.forEach(([account, amount]) => {
            csvContent += `${account},${amount.toFixed(2)}\n`;
        });
        csvContent += `Total Expenses,${data.expenses.toFixed(2)}\n\n`;
        
        csvContent += "NET PROFIT\n";
        csvContent += `Net Profit,${data.net.toFixed(2)}\n`;

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Clario_PL_${selectedPeriod.toUpperCase()}_${CURRENT_DATE_ISO}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

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
                    <div className="pnl-actions">
                        <button className="btn-export" onClick={handleExportPL}><ExportIcon /> Export to CSV</button>
                        <div className="period-selector">
                            {(['q1', 'q2', 'q3', 'q4', 'ytd'] as const).map(p => (
                                <button key={p} className={selectedPeriod === p ? 'active' : ''} onClick={() => setSelectedPeriod(p)}>
                                    {p.toUpperCase()}
                                </button>
                            ))}
                        </div>
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
                <h3>Expense Analysis ({selectedPeriod.toUpperCase()})</h3>
                <ExpensePieChart data={expenseAccounts} total={totalExpenses} />
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
    handleUpdateInvoiceStatus: (id: string, status: 'Sent' | 'Paid') => void,
    handleDeleteInvoice: (id: string) => void
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
    handleUpdateBillStatus: (id: string, status: 'Paid') => void,
    handleDeleteBill: (id: string) => void
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
    handleDeleteProject: (id: string) => void
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

const KnowledgeBaseView: React.FC<{
    onAsk: (question: string) => void;
    answer: string;
    isLoading: boolean;
}> = ({ onAsk, answer, isLoading }) => {
    const [customQuestion, setCustomQuestion] = useState('');
    const suggestedQuestions = [
        "What are my top 5 expenses this year?",
        "How does my income compare to my expenses?",
        "Which project is most profitable?",
        "Provide a summary of my financial health.",
    ];
    
    const handleAskQuestion = (question: string) => {
        if (question.trim()) {
            onAsk(question);
            setCustomQuestion('');
        }
    }

    return (
        <div className="card knowledge-base-view">
            <div className="module-header">
                <h1>Knowledge Base</h1>
            </div>
            <p className="subtitle">Ask questions about your finances and get data-driven answers from our AI assistant.</p>
            
            <div className="suggested-questions">
                <h4>Suggested Questions</h4>
                <div className="questions-grid">
                    {suggestedQuestions.map(q => (
                        <button key={q} className="suggested-question-btn" onClick={() => handleAskQuestion(q)} disabled={isLoading}>
                            {q}
                        </button>
                    ))}
                </div>
            </div>

            <div className="custom-question-area">
                <textarea 
                    value={customQuestion}
                    onChange={e => setCustomQuestion(e.target.value)}
                    placeholder="Or, ask your own question here..."
                    disabled={isLoading}
                />
                <button className="submit-button" onClick={() => handleAskQuestion(customQuestion)} disabled={isLoading || !customQuestion.trim()}>
                    {isLoading ? <span className="loader" /> : 'Ask Question'}
                </button>
            </div>
            
            {(isLoading || answer) && (
                <div className="answer-section">
                    <h4>AI Response</h4>
                    <div className="answer-display">
                        {isLoading ? (
                            <div className="loading-answer">
                                <span className="loader" />
                                <p>Analyzing your data...</p>
                            </div>
                        ) : (
                            <pre>{answer}</pre>
                        )}
                    </div>
                </div>
            )}
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
    taxAgentResponse: string,
    isVatEnabled: boolean,
    setIsVatEnabled: (enabled: boolean) => void,
    vatRate: number,
    setVatRate: (rate: number) => void,
}> = ({
    financials, quarterlyPayments, setQuarterlyPayments, seTaxRate, setSeTaxRate, salesTaxRate, setSalesTaxRate,
    irsMileageRate, setIrsMileageRate, taxQuestion, setTaxQuestion, handleAskTaxAgent, isTaxAgentLoading, taxAgentResponse,
    isVatEnabled, setIsVatEnabled, vatRate, setVatRate
}) => {
    const { tax, vat } = financials;
    const paymentDueText = tax.currentQuarterPaymentDue >= 0 ? "Est. Payment Due" : "Est. Overpayment / Refund";
    const paymentDueClass = tax.currentQuarterPaymentDue >= 0 ? "warning" : "income";
    const netVatPayableClass = vat.netVatPayable >= 0 ? "warning" : "income";

    return (
         <div className="card">
            <div className="module-header">
                <h1>Tax Agent</h1>
            </div>
            <p className="disclaimer">
                This is an AI-powered tool for estimation purposes only. It is not financial advice. Please consult with a qualified tax professional.
            </p>
            <div className="stat-card-grid tax-grid">
                {isVatEnabled && (
                     <div className="stat-card">
                        <div className="label">
                           Net VAT Payable
                           <Tooltip
                                text={
                                    <div className="tax-breakdown">
                                        <h4>VAT Calculation</h4>
                                        <div className="breakdown-line"><span>Total Output VAT (Sales)</span> <span>${vat.totalOutputVAT.toFixed(2)}</span></div>
                                        <div className="breakdown-line"><span>Total Input VAT (Purchases)</span> <span>-${vat.totalInputVAT.toFixed(2)}</span></div>
                                        <hr/>
                                        <div className={`breakdown-line total ${netVatPayableClass}-text`}><span>Net VAT Payable</span> <span>${vat.netVatPayable.toFixed(2)}</span></div>
                                    </div>
                                }
                            />
                        </div>
                        <div className={`value ${netVatPayableClass}`}>${vat.netVatPayable.toFixed(2)}</div>
                    </div>
                )}
                 <div className="stat-card">
                    <div className="label">YTD Net Profit (for Tax)</div>
                    <div className="value">${financials.ytd.netProfitForTax.toFixed(2)}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Est. YTD SE Tax</div>
                    <div className="value warning">${tax.totalTaxOnYTDProfit.toFixed(2)}</div>
                </div>
                 {!isVatEnabled && (
                    <div className="stat-card">
                        <div className="label">Est. Sales Tax Owed</div>
                        <div className="value warning">${tax.estimatedSalesTax.toFixed(2)}</div>
                    </div>
                 )}
            </div>
            <div className="tax-settings-section">
                <h3>Tax Settings</h3>
                 <div className="tax-settings">
                     <div className="form-group">
                        <label>Self-Employment Tax Rate (%)</label>
                        <input type="number" value={seTaxRate} onChange={e => setSeTaxRate(parseFloat(e.target.value) || 0)} />
                    </div>
                    {!isVatEnabled && (
                        <div className="form-group">
                            <label>Sales Tax Rate (%)</label>
                            <input type="number" value={salesTaxRate} onChange={e => setSalesTaxRate(parseFloat(e.target.value) || 0)} />
                        </div>
                    )}
                    <div className="form-group">
                        <label>IRS Mileage Rate ($)</label>
                        <input type="number" step="0.01" value={irsMileageRate} onChange={e => setIrsMileageRate(parseFloat(e.target.value) || 0)} />
                    </div>
                 </div>
                 <div className="vat-settings">
                    <div className="form-group form-group-toggle">
                        <label>Enable VAT Calculation</label>
                         <label className="switch">
                            <input type="checkbox" checked={isVatEnabled} onChange={e => setIsVatEnabled(e.target.checked)} />
                            <span className="slider round"></span>
                        </label>
                    </div>
                    {isVatEnabled && (
                        <div className="form-group">
                            <label>VAT Rate (%)</label>
                            <input type="number" step="0.1" value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value) || 0)} />
                        </div>
                    )}
                </div>
            </div>


             <div className="tax-payments">
                <h4>Quarterly Estimated Tax Payments Made (SE Tax)</h4>
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
    handleDeleteRecurringTransaction: (id: string) => void
    chartOfAccounts: Account[],
}> = ({ recurringTransactions, handleAddRecurringTransaction, handleDeleteRecurringTransaction, chartOfAccounts }) => {
    const [formType, setFormType] = useState<'payment' | 'depreciation'>('payment');

    // State for Payment form
    const [recDesc, setRecDesc] = useState('');
    const [recAmount, setRecAmount] = useState(0);
    const [recType, setRecType] = useState<'income'|'expense'>('expense');
    const [recFreq, setRecFreq] = useState<'daily'|'weekly'|'monthly'|'yearly'>('monthly');
    const [recStart, setRecStart] = useState(CURRENT_DATE_ISO);

    // State for Depreciation form
    const [assetDesc, setAssetDesc] = useState('');
    const [assetCost, setAssetCost] = useState(0);
    const [depreciationYears, setDepreciationYears] = useState(5);
    const [depreciationExpenseAccount, setDepreciationExpenseAccount] = useState('Depreciation Expense');

    const expenseAccounts = useMemo(() => chartOfAccounts.filter(a => a.type === 'Expense').sort((a,b) => a.name.localeCompare(b.name)), [chartOfAccounts]);

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (formType === 'payment') {
            const newRec: Omit<RecurringTransaction, 'id'> = {
                recurringType: 'payment',
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
        } else { // Depreciation
            const monthlyAmount = assetCost / (depreciationYears * 12);
            if (monthlyAmount <= 0 || !assetDesc) {
                alert("Please fill in all asset details.");
                return;
            }
            const newRec: Omit<RecurringTransaction, 'id'> = {
                recurringType: 'depreciation',
                description: assetDesc,
                frequency: 'monthly', // Hardcoded
                startDate: recStart,
                nextDueDate: recStart,
                assetCost: assetCost,
                depreciationPeriodYears: depreciationYears,
                details: {
                    vendor: `${assetDesc} (Depreciation)`,
                    amount: monthlyAmount,
                    currency: 'USD',
                    category: 'Depreciation',
                    transactionType: 'expense',
                    classification: 'business',
                    deductible: true,
                    journal: [
                        { account: depreciationExpenseAccount, debit: monthlyAmount },
                        { account: 'Accumulated Depreciation', credit: monthlyAmount }
                    ]
                }
            };
            handleAddRecurringTransaction(newRec);
            // Reset form
            setAssetDesc('');
            setAssetCost(0);
            setDepreciationYears(5);
        }
    };
    
    const monthlyDepreciation = useMemo(() => {
        if (assetCost > 0 && depreciationYears > 0) {
            return (assetCost / (depreciationYears * 12)).toFixed(2);
        }
        return '0.00';
    }, [assetCost, depreciationYears]);

    return (
        <div>
             <div className="module-header">
                <h1>Recurring Transactions</h1>
            </div>
            <div className="card">
                <h3>Add New Schedule</h3>
                 <div className="toggle-group">
                    <button className={formType === 'payment' ? 'active' : ''} onClick={() => setFormType('payment')}>Recurring Payment</button>
                    <button className={formType === 'depreciation' ? 'active' : ''} onClick={() => setFormType('depreciation')}>Depreciation Schedule</button>
                </div>

                <form onSubmit={handleAdd}>
                    {formType === 'payment' ? (
                        <>
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
                             <button type="submit" className="btn-primary">Add Payment Schedule</button>
                        </>
                    ) : (
                        <>
                             <div className="form-grid">
                                <div className="form-group full-width">
                                    <label>Asset Description</label>
                                    <input type="text" value={assetDesc} onChange={e => setAssetDesc(e.target.value)} required placeholder="e.g., Company Vehicle, MacBook Pro"/>
                                </div>
                                <div className="form-group">
                                    <label>Original Asset Cost</label>
                                    <input type="number" value={assetCost} onChange={e => setAssetCost(parseFloat(e.target.value) || 0)} required />
                                </div>
                                <div className="form-group">
                                    <label>Depreciation Period (Years)</label>
                                    <input type="number" value={depreciationYears} onChange={e => setDepreciationYears(parseInt(e.target.value, 10) || 0)} required />
                                </div>
                                 <div className="form-group">
                                     <label>Start Date of Use</label>
                                     <input type="date" value={recStart} onChange={e => setRecStart(e.target.value)} required/>
                                 </div>
                                <div className="form-group">
                                    <label>Expense Account Category</label>
                                    <select value={depreciationExpenseAccount} onChange={e => setDepreciationExpenseAccount(e.target.value)}>
                                        {expenseAccounts.map(acc => <option key={acc.name} value={acc.name}>{acc.name}</option>)}
                                    </select>
                                </div>
                             </div>
                             <div className="calculated-result">
                                Monthly Depreciation Expense: <strong>${monthlyDepreciation}</strong>
                             </div>
                             <button type="submit" className="btn-primary">Add Depreciation Schedule</button>
                        </>
                    )}
                </form>
            </div>

            <div className="recurring-list">
                {recurringTransactions.length > 0 ? recurringTransactions.map(rt => (
                     <div key={rt.id} className={`recurring-card ${rt.details.transactionType}`}>
                         <div className="recurring-card-info">
                            <span className="recurring-type-badge">{rt.recurringType === 'depreciation' ? 'Depreciation' : 'Payment'}</span>
                             <span className="recurring-desc">{rt.description}</span>
                             <span className="recurring-details">
                                {rt.recurringType === 'depreciation' ? `Total Cost: $${rt.assetCost?.toFixed(2)} (${rt.depreciationPeriodYears} years)` : `Next payment: ${rt.nextDueDate} (${rt.frequency})`}
                             </span>
                         </div>
                         <div className="recurring-card-finance">
                             <span className="recurring-amount">${rt.details.amount.toFixed(2)}</span>
                             <span className="recurring-amount-label">{rt.recurringType === 'depreciation' ? 'per month' : ''}</span>
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
        const allEntries: (JournalEntry & { date: string, vendor: string, txId: string, entryId: string })[] = [];
        transactions.forEach(t => {
            t.journal.forEach((j, index) => {
                allEntries.push({
                    txId: t.id,
                    entryId: `${t.id}-${index}`,
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
                    {journalEntries.length > 0 ? journalEntries.map((entry) => (
                        <tr key={entry.entryId}>
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

const TransactionCard = ({ transaction, onEdit, onDelete, projects, onToggleClassification }: { transaction: Transaction, onEdit: (t: Transaction) => void, onDelete: (id: string) => void, projects: Project[], onToggleClassification: (id: string) => void }) => {
    const project = projects.find(p => p.id === transaction.projectId);
    const totalAmount = transaction.amount + (transaction.vatAmount || 0);

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
            ${totalAmount.toFixed(2)}
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


const InvoiceCard = ({ invoice, onUpdateStatus, onDelete }: { invoice: Invoice, onUpdateStatus: (id: string, status: 'Sent' | 'Paid') => void, onDelete: (id: string) => void }) => {
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

const BillCard = ({ bill, onUpdateStatus, onDelete }: { bill: Bill, onUpdateStatus: (id: string, status: 'Paid') => void, onDelete: (id: string) => void }) => {
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
                        <div className="form-group"><label>Amount (pre-tax)</label><input type="number" name="amount" value={formData.amount} onChange={handleChange} /></div>
                        <div className="form-group"><label>VAT Amount</label><input type="number" name="vatAmount" value={formData.vatAmount || ''} onChange={handleChange} /></div>
                        <div className="form-group full-width"><label>Category</label><input type="text" name="category" value={formData.category} onChange={handleChange} /></div>
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

const InvoiceModal = ({ onClose, onCreate, projects, isVatEnabled, vatRate }: { onClose: () => void; onCreate: (data: Omit<Invoice, 'id'|'status'|'relatedTransactionId'> & { projectId?: string }) => void; projects: Project[], isVatEnabled: boolean, vatRate: number }) => {
    const [customer, setCustomer] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(CURRENT_DATE_ISO);
    const [dueDate, setDueDate] = useState('');
    const [amount, setAmount] = useState(0);
    const [taxable, setTaxable] = useState(false);
    const [projectId, setProjectId] = useState('');

    const vatAmount = isVatEnabled && taxable ? amount * (vatRate / 100) : 0;
    const totalAmount = amount + vatAmount;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onCreate({ customer, invoiceNumber, invoiceDate, dueDate, amount, taxable, projectId: projectId || undefined });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Create New Invoice</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group full-width"><label>Customer Name</label><input type="text" value={customer} onChange={e => setCustomer(e.target.value)} required /></div>
                        <div className="form-group"><label>Invoice #</label><input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} required /></div>
                        <div className="form-group"><label>Amount (pre-tax)</label><input type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)} required /></div>
                        <div className="form-group"><label>Invoice Date</label><input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required /></div>
                        <div className="form-group"><label>Due Date</label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required /></div>
                        <div className="form-group">
                            <label>Assign to Project (Optional)</label>
                            <select value={projectId} onChange={e => setProjectId(e.target.value)}>
                                <option value="">None</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group form-group-checkbox"><label><input type="checkbox" checked={taxable} onChange={e => setTaxable(e.target.checked)} /> {isVatEnabled ? `Apply ${vatRate}% VAT` : `Is this sale taxable?`}</label></div>
                    </div>
                     {isVatEnabled && taxable && (
                        <div className="calculated-result">
                            VAT: ${vatAmount.toFixed(2)} | <strong>Total: ${totalAmount.toFixed(2)}</strong>
                        </div>
                    )}
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary">Create Invoice</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const BillModal = ({ onClose, onCreate, projects, isVatEnabled }: { onClose: () => void; onCreate: (data: Omit<Bill, 'id'|'status'|'relatedTransactionId'> & { projectId?: string, vatAmount?: number }) => void; projects: Project[], isVatEnabled: boolean }) => {
    const [vendor, setVendor] = useState('');
    const [billNumber, setBillNumber] = useState('');
    const [billDate, setBillDate] = useState(CURRENT_DATE_ISO);
    const [dueDate, setDueDate] = useState('');
    const [amount, setAmount] = useState(0);
    const [vatAmount, setVatAmount] = useState(0);
    const [projectId, setProjectId] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onCreate({ vendor, billNumber, billDate, dueDate, amount, projectId: projectId || undefined, vatAmount: isVatEnabled ? vatAmount : undefined });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Record New Bill</h2>
                 <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group full-width"><label>Vendor Name</label><input type="text" value={vendor} onChange={e => setVendor(e.target.value)} required /></div>
                        <div className="form-group"><label>Bill #</label><input type="text" value={billNumber} onChange={e => setBillNumber(e.target.value)} /></div>
                        <div className="form-group"><label>Amount (pre-tax)</label><input type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)} required /></div>
                        {isVatEnabled && <div className="form-group"><label>Input VAT Amount</label><input type="number" value={vatAmount} onChange={e => setVatAmount(parseFloat(e.target.value) || 0)} /></div>}
                        <div className="form-group"><label>Bill Date</label><input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} required /></div>
                        <div className="form-group"><label>Due Date</label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required /></div>
                        <div className="form-group full-width">
                            <label>Assign to Project (Optional)</label>
                            <select value={projectId} onChange={e => setProjectId(e.target.value)}>
                                <option value="">None</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                    </div>
                     {isVatEnabled && (
                        <div className="calculated-result">
                            <strong>Total Bill Amount: ${(amount + vatAmount).toFixed(2)}</strong>
                        </div>
                    )}
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary">Create Bill</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const HireExpertModal: React.FC<{
    expertName: string;
    onClose: () => void;
    onSubmit: (details: { title: string; description: string }) => void;
}> = ({ expertName, onClose, onSubmit }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (title && description) {
            onSubmit({ title, description });
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Send Hiring Request to {expertName}</h2>
                <p>Describe your project details below. {expertName} will be notified and can respond to you directly.</p>
                <form onSubmit={handleSubmit} style={{ marginTop: '1.5rem' }}>
                    <div className="form-group full-width">
                        <label htmlFor="project-title">Project Title</label>
                        <input
                            type="text"
                            id="project-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g., Monthly Bookkeeping for my LLC"
                            required
                        />
                    </div>
                    <div className="form-group full-width">
                        <label htmlFor="project-description">Project Description</label>
                        <textarea
                            id="project-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Please describe the work you need done, including any specific tasks, goals, or deadlines."
                            required
                            style={{ minHeight: '120px' }}
                        />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary">Send Request</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const Stars = ({ rating, count }: { rating: number, count?: number }) => (
    <div className="stars-container">
        <div className="stars">
            {[1, 2, 3, 4, 5].map(i => <StarIcon key={i} filled={i <= rating} />)}
        </div>
        {count !== undefined && <span className="review-count">({count})</span>}
    </div>
);


const ExpertCard: React.FC<{ expert: Expert, onViewProfile: () => void }> = ({ expert, onViewProfile }) => (
    <div className="expert-card" onClick={onViewProfile}>
        <div className="expert-card-header">
            <img src={expert.profileImageUrl} alt={expert.name} className="expert-avatar" />
            <div className="expert-info">
                <div className="expert-name-row">
                    <h3 className="expert-name">{expert.name}</h3>
                    {expert.verified && <span className="verified-badge" title="Identity Verified"><CheckCircleIcon /></span>}
                </div>
                <p className="expert-title">{expert.title}</p>
                <div className="expert-rating">
                    <StarIcon filled={true} /> 
                    <span>{expert.rating.toFixed(1)} ({expert.reviewCount} reviews)</span>
                </div>
            </div>
        </div>
        <div className="expert-card-skills">
            {expert.skills.slice(0, 3).map(skill => <span key={skill} className="skill-tag">{skill}</span>)}
        </div>
        <div className="expert-card-footer">
            <span className="expert-rate">Starts at <strong>${expert.hourlyRate}/hr</strong></span>
            <button className="btn-secondary">View Profile</button>
        </div>
    </div>
);


const FindExpertsView: React.FC<{ experts: Expert[], onViewExpert: (id: string) => void }> = ({ experts, onViewExpert }) => {
    return (
        <div className="find-experts-view">
            <div className="module-header">
                <h1>Find Your Financial Pro</h1>
            </div>
            <div className="filter-bar card">
                <input type="text" placeholder="Search by name or keyword..." className="filter-search"/>
                <select className="filter-select">
                    <option value="">All Services</option>
                    <option>Bookkeeping</option>
                    <option>Tax Preparation</option>
                    <option>Payroll</option>
                    <option>Financial Consulting</option>
                </select>
                <div className="filter-rate">
                    <label>Max Rate ($/hr)</label>
                    <input type="range" min="25" max="300" defaultValue="150" />
                </div>
                <button className="btn-primary">Search</button>
            </div>
            <div className="experts-grid">
                {experts.map(expert => (
                    <ExpertCard key={expert.id} expert={expert} onViewProfile={() => onViewExpert(expert.id)} />
                ))}
            </div>
        </div>
    );
};

const getSkillIcon = (skill: string) => {
    const s = skill.toLowerCase();
    if (s.includes('tax') || s.includes('irs')) return <TaxIcon />;
    if (s.includes('shopify') || s.includes('e-commerce')) return <ShopifyIcon />;
    if (s.includes('bookkeeping')) return <JournalIcon />;
    return <BriefcaseIcon />;
}

const ExpertProfileLayout: React.FC<{ expert: Expert, onHire: () => void, isPublic?: boolean }> = ({ expert, onHire, isPublic = false }) => {
    return (
        <div className="profile-grid">
            <div className="profile-main">
                <div className="profile-header card">
                    <img src={expert.profileImageUrl} alt={expert.name} className="profile-avatar" />
                    <div className="profile-header-info">
                        <div className="profile-name-row">
                            <h1>{expert.name}</h1>
                            {expert.verified && <span className="verified-badge-large" title="Identity Verified"><CheckCircleIcon /> Verified</span>}
                        </div>
                        <p className="profile-title">{expert.title}</p>
                        <p className="profile-location">{expert.location}</p>
                        <div className="profile-rating">
                            <Stars rating={expert.rating} count={expert.reviewCount}/>
                        </div>
                    </div>
                </div>

                <div className="profile-section card">
                    <h2>About Me</h2>
                    <p>{expert.bio}</p>
                </div>

                 <div className="profile-section">
                    <h2>Services</h2>
                    <div className="service-list">
                        {expert.services.map(service => (
                            <div key={service.name} className="service-card">
                                <div className="service-info">
                                    <h3>{service.name}</h3>
                                    <p>{service.description}</p>
                                </div>
                                <div className="service-price">
                                    <span>{service.price}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                 <div className="profile-section card">
                    <h3>Client Reviews ({expert.reviewCount})</h3>
                    <div className="review-list">
                        {expert.reviews.map(review => (
                            <div key={review.id} className="review-card">
                                <div className="review-header">
                                    <img src={review.reviewerImageUrl} alt={review.reviewerName} />
                                    <div>
                                        <strong>{review.reviewerName}</strong>
                                        <span>{review.date}</span>
                                    </div>
                                    <div className="review-rating">
                                        <Stars rating={review.rating} />
                                    </div>
                                </div>
                                <p className="review-comment">"{review.comment}"</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="profile-sidebar">
                <div className="profile-action-card card">
                    <div className="profile-rate">
                        <strong>${expert.hourlyRate}</strong>
                        <span>/hr</span>
                    </div>
                    <button className="btn-primary btn-large" onClick={onHire}>
                        {isPublic ? `Log In to Hire` : `Hire ${expert.name.split(' ')[0]}`}
                    </button>
                </div>
                <div className="card">
                     <h3>Qualifications</h3>
                     <ul className="qualifications-list">
                        {expert.verified && (
                            <li className="qualification-item verified">
                                <CheckCircleIcon />
                                <span>Identity Verified</span>
                            </li>
                        )}
                        <li className="qualification-item">
                            <ClockIcon />
                            <span>Responds <strong>{expert.responseTime}</strong></span>
                        </li>
                         <li className="qualification-item">
                            <CalendarIcon />
                            <span>Member since {new Date(expert.joinedDate).getFullYear()}</span>
                        </li>
                     </ul>
                </div>
                <div className="card">
                     <h3>Skills</h3>
                     <ul className="profile-skills-list">
                        {expert.skills.map(skill => (
                            <li key={skill} className="skill-item">
                                {getSkillIcon(skill)}
                                <span>{skill}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};


const ExpertProfileView: React.FC<{ expert: Expert, onBack: () => void, onHire: () => void }> = ({ expert, onBack, onHire }) => {
    return (
        <div className="expert-profile-view">
            <button onClick={onBack} className="back-button">&larr; Back to Experts</button>
            <ExpertProfileLayout expert={expert} onHire={onHire} />
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);