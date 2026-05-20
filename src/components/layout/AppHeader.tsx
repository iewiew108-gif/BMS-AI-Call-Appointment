// =============================================================================
// BMS Session KPI Dashboard - App Header
// Refined professional navigation with modern aesthetics
// =============================================================================

import { useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import {
  Activity,
  LayoutDashboard,
  LogOut,
  Database,
  ChevronDown,
  PhoneCall,
  BellRing,
  Settings2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { subscribeUrgentCallbacks, getPendingCount } from '@/services/urgentCallbacks';

// ---------------------------------------------------------------------------
// Navigation tab definitions
// ---------------------------------------------------------------------------

interface NavTab {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: () => number;
}

const NAV_TABS: NavTab[] = [
  { label: 'หน้าหลัก', path: '/', icon: LayoutDashboard },
  { label: 'AI โทรยืนยันนัด', path: '/appointments', icon: PhoneCall },
  { label: 'แจ้งพยาบาลด่วน', path: '/urgent-callback', icon: BellRing, badge: getPendingCount },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppHeader() {
  const { session, disconnectSession } = useBmsSessionContext();
  const location = useLocation();

  // Subscribe to urgent callbacks for live badge count
  const urgentPending = useSyncExternalStore(subscribeUrgentCallbacks, getPendingCount);

  const databaseLabel =
    session?.databaseType === 'postgresql' ? 'PostgreSQL' : 'MySQL';

  const userInitial = session?.userInfo.name?.charAt(0).toUpperCase() ?? '?';

  return (
    <header className="app-header">
      {/* Decorative top accent line */}
      <div className="header-accent-line" />

      <div className="header-inner">
        {/* -----------------------------------------------------------------
            Left: Brand
            ----------------------------------------------------------------- */}
        <div className="header-brand">
          <div className="brand-icon">
            <Activity className="h-5 w-5" />
          </div>
          <div className="brand-text">
            <div className="brand-title-row">
              <h1 className="brand-title">Template App</h1>
              <span className="demo-badge">DEMO</span>
            </div>
            <span className="brand-subtitle">BMS Session · สำหรับ Demo เท่านั้น</span>
          </div>
        </div>

        {/* -----------------------------------------------------------------
            Center: Navigation
            ----------------------------------------------------------------- */}
        <nav className="header-nav">
          {NAV_TABS.map((tab) => {
            const isActive =
              tab.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(tab.path);

            const Icon = tab.icon;
            const badgeCount = tab.path === '/urgent-callback' ? urgentPending : 0;

            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`nav-tab ${isActive ? 'nav-tab-active' : ''} ${tab.path === '/urgent-callback' ? 'nav-tab-urgent' : ''}`}
              >
                <span className="nav-tab-icon-wrap">
                  <Icon className="h-4 w-4" />
                  {badgeCount > 0 && (
                    <span className="nav-badge">{badgeCount > 9 ? '9+' : badgeCount}</span>
                  )}
                </span>
                <span>{tab.label}</span>
                {isActive && <span className="nav-tab-indicator" />}
              </Link>
            );
          })}
        </nav>

        {/* -----------------------------------------------------------------
            Right: Session Info
            ----------------------------------------------------------------- */}
        <div className="header-session">
          {session && (
            <>
              {/* Connection status */}
              <div className="session-status">
                <span className="status-dot">
                  <span className="status-dot-ping" />
                  <span className="status-dot-core" />
                </span>
                <span className="status-text">เชื่อมต่อแล้ว</span>
              </div>

              <div className="session-divider" />

              {/* Database badge */}
              <div className="session-database">
                <Database className="h-3.5 w-3.5" />
                <span>{databaseLabel}</span>
              </div>

              <div className="session-divider" />

              {/* User */}
              <div className="session-user">
                <div className="user-avatar">{userInitial}</div>
                <div className="user-info">
                  <span className="user-name">{session.userInfo.name}</span>
                  <span className="user-dept">{session.userInfo.department}</span>
                </div>
                <ChevronDown className="h-4 w-4 text-white/40" />
              </div>

              {/* Settings */}
              <Link
                to="/settings"
                className={`settings-btn ${location.pathname === '/settings' ? 'settings-btn-active' : ''}`}
                aria-label="ตั้งค่า"
                title="ตั้งค่า"
              >
                <Settings2 className="h-4 w-4" />
              </Link>

              {/* Disconnect */}
              <button type="button" onClick={disconnectSession} className="disconnect-btn">
                <LogOut className="h-4 w-4" />
                <span>ออกจากระบบ</span>
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        .app-header {
          position: sticky;
          top: 0;
          z-index: 50;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .header-accent-line {
          height: 2px;
          background: linear-gradient(90deg, #60a5fa 0%, #a78bfa 50%, #f472b6 100%);
        }

        .header-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 60px;
          padding: 0 1.5rem;
        }

        /* Brand */
        .header-brand {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .brand-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2.25rem;
          height: 2.25rem;
          background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
          border-radius: 0.625rem;
          color: white;
          box-shadow: 0 2px 8px -2px rgba(99, 102, 241, 0.5);
        }

        .brand-text {
          display: flex;
          flex-direction: column;
        }

        .brand-title-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .brand-title {
          font-size: 0.9375rem;
          font-weight: 600;
          color: white;
          margin: 0;
          line-height: 1.2;
          letter-spacing: -0.01em;
        }

        .demo-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.1rem 0.45rem;
          border-radius: 0.3rem;
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #fde68a;
          background: rgba(251, 191, 36, 0.18);
          border: 1px solid rgba(251, 191, 36, 0.4);
          animation: demoPulse 3s ease-in-out infinite;
        }

        @keyframes demoPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.6; }
        }

        .brand-subtitle {
          font-size: 0.6875rem;
          color: rgba(255, 255, 255, 0.4);
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        /* Navigation */
        .header-nav {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .nav-tab {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.5);
          border-radius: 0.5rem;
          transition: all 0.2s ease;
        }

        .nav-tab:hover {
          color: rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.05);
        }

        .nav-tab-active {
          color: white;
          background: rgba(255, 255, 255, 0.1);
        }

        .nav-tab-urgent {
          color: rgba(252, 165, 165, 0.7);
        }

        .nav-tab-urgent:hover {
          color: rgba(252, 165, 165, 1);
          background: rgba(239, 68, 68, 0.1);
        }

        .nav-tab-urgent.nav-tab-active {
          color: #fca5a5;
          background: rgba(239, 68, 68, 0.15);
        }

        .nav-tab-icon-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .nav-badge {
          position: absolute;
          top: -7px;
          right: -8px;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          background: #ef4444;
          border-radius: 999px;
          font-size: 0.625rem;
          font-weight: 700;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          box-shadow: 0 0 0 2px #1e293b;
          animation: badgePop 0.3s ease;
        }

        @keyframes badgePop {
          0% { transform: scale(0); }
          70% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }

        .nav-tab-indicator {
          position: absolute;
          bottom: -1px;
          left: 1rem;
          right: 1rem;
          height: 2px;
          background: linear-gradient(90deg, #60a5fa, #a78bfa);
          border-radius: 1px;
        }

        /* Session */
        .header-session {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .session-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .status-dot {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 0.625rem;
          height: 0.625rem;
        }

        .status-dot-ping {
          position: absolute;
          inset: -3px;
          background: #4ade80;
          border-radius: 50%;
          opacity: 0.4;
          animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }

        .status-dot-core {
          width: 0.625rem;
          height: 0.625rem;
          background: #4ade80;
          border-radius: 50%;
          box-shadow: 0 0 4px #4ade80;
        }

        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }

        .status-text {
          font-size: 0.75rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.7);
        }

        .session-divider {
          width: 1px;
          height: 20px;
          background: rgba(255, 255, 255, 0.1);
        }

        .session-database {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 0.375rem;
          font-size: 0.6875rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.7);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .session-user {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          padding: 0.25rem;
          padding-right: 0.5rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 2rem;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .session-user:hover {
          background: rgba(255, 255, 255, 0.08);
        }

        .user-avatar {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
          border-radius: 50%;
          font-size: 0.75rem;
          font-weight: 600;
          color: white;
        }

        .user-info {
          display: flex;
          flex-direction: column;
        }

        .user-name {
          font-size: 0.8125rem;
          font-weight: 500;
          color: white;
          line-height: 1.2;
        }

        .user-dept {
          font-size: 0.625rem;
          color: rgba(255, 255, 255, 0.4);
          line-height: 1.2;
        }

        .settings-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          border-radius: 0.5rem;
          color: rgba(255, 255, 255, 0.5);
          transition: all 0.2s ease;
          text-decoration: none;
        }

        .settings-btn:hover {
          color: rgba(255, 255, 255, 0.85);
          background: rgba(255, 255, 255, 0.08);
        }

        .settings-btn-active {
          color: white;
          background: rgba(255, 255, 255, 0.12);
        }

        .disconnect-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.875rem;
          background: transparent;
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 0.5rem;
          font-size: 0.75rem;
          font-weight: 500;
          color: rgba(239, 68, 68, 0.8);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .disconnect-btn:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.5);
          color: #ef4444;
        }

        @media (max-width: 768px) {
          .header-inner {
            padding: 0 1rem;
          }

          .session-database,
          .session-divider,
          .status-text {
            display: none;
          }

          .disconnect-btn span {
            display: none;
          }

          .disconnect-btn {
            padding: 0.5rem;
          }
        }
      `}</style>
    </header>
  );
}
