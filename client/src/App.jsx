import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ProfessorsPage from './pages/ProfessorsPage';
import ProfessorDetailPage from './pages/ProfessorDetailPage';
import LocationsPage from './pages/LocationsPage';
import LocationDetailPage from './pages/LocationDetailPage';
import ProgramsPage from './pages/ProgramsPage';
import ProgramDetailPage from './pages/ProgramDetailPage';
import PartiesPage from './pages/PartiesPage';
import PartyDetailPage from './pages/PartyDetailPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import StudentsPage from './pages/StudentsPage';
import StudentDetailPage from './pages/StudentDetailPage';
import BulkInputPage from './pages/BulkInputPage';
import ToolManagerPage from './pages/ToolManagerPage';
import ProfessorSchedulePage from './pages/ProfessorSchedulePage';
import AssignmentBoardPage from './pages/AssignmentBoardPage';
import PayrollDashboardPage from './pages/PayrollDashboardPage';
import MiscPayPage from './pages/MiscPayPage';
import FmDailyLogPage from './pages/FmDailyLogPage';
import GustoCodesPage from './pages/GustoCodesPage';
import PayrollRunsPage from './pages/PayrollRunsPage';
import ReportBuilderPage from './pages/ReportBuilderPage';
import TeamDashboardPage from './pages/TeamDashboardPage';
import SessionPayPage from './pages/SessionPayPage';
import OnboardingPayPage from './pages/OnboardingPayPage';
import MileagePage from './pages/MileagePage';
import ContractorsPage from './pages/ContractorsPage';
import ContractorDetailPage from './pages/ContractorDetailPage';
import LessonsPage from './pages/LessonsPage';
import LessonDetailPage from './pages/LessonDetailPage';
import ModuleDetailPage from './pages/ModuleDetailPage';
import HolidaysPage from './pages/HolidaysPage';
import HolidayDetailPage from './pages/HolidayDetailPage';
import ParentsPage from './pages/ParentsPage';
import ParentDetailPage from './pages/ParentDetailPage';
import AreasPage from './pages/AreasPage';
import CandidatesPage from './pages/CandidatesPage';
import CandidateDetailPage from './pages/CandidateDetailPage';
import CandidateProfilePage from './pages/CandidateProfilePage';
import OnboardingRequirementsPage from './pages/OnboardingRequirementsPage';
import OnboardingTemplatesPage from './pages/OnboardingTemplatesPage';
import EmailTemplatesPage from './pages/EmailTemplatesPage';
import PendingApprovalsPage from './pages/PendingApprovalsPage';
import ReportFieldConfigPage from './pages/ReportFieldConfigPage';
import CandidatePortalPage from './pages/CandidatePortalPage';
import SubManagementPage from './pages/SubManagementPage';
import EvaluationDashboardPage from './pages/EvaluationDashboardPage';
import WeeklyOverviewPage from './pages/WeeklyOverviewPage';
import ObservationLookupPage from './pages/ObservationLookupPage';
import ObservationHistoryPage from './pages/ObservationHistoryPage';
import PartyConfirmsPage from './pages/PartyConfirmsPage';
import HiringRequestsPage from './pages/HiringRequestsPage';
import AreaPayRatesPage from './pages/AreaPayRatesPage';
import PartyEmailTemplatesPage from './pages/PartyEmailTemplatesPage';
import PartyCalendarPage from './pages/PartyCalendarPage';
import PartyAssignPage from './pages/PartyAssignPage';
import IncidentReportPage from './pages/IncidentReportPage';
import NotificationsPage from './pages/NotificationsPage';
import ClientTemplatesPage from './pages/ClientTemplatesPage';
import ClientEmailsPage from './pages/client-management/ClientEmailsPage';
import FeedbackToolsPage from './pages/client-management/FeedbackToolsPage';
import StartingEmailsPage from './pages/client-management/StartingEmailsPage';
import FirstDayParentPage from './pages/client-management/FirstDayParentPage';
import SecondWeekPage from './pages/client-management/SecondWeekPage';
import SubEmailsPage from './pages/client-management/SubEmailsPage';
import NewProfessorPage from './pages/client-management/NewProfessorPage';
import LastDayPage from './pages/client-management/LastDayPage';
import ParentFeedbackPage from './pages/client-management/ParentFeedbackPage';
import SiteCheckInsPage from './pages/client-management/SiteCheckInsPage';
import NpsEmailsPage from './pages/client-management/NpsEmailsPage';
import RosterEmailsPage from './pages/client-management/RosterEmailsPage';
import RebookingPage from './pages/client-management/RebookingPage';
import InvoiceQueuePage from './pages/invoicing/InvoiceQueuePage';
import MonthlyInvoicingPage from './pages/invoicing/MonthlyInvoicingPage';
import InvoiceTrackerPage from './pages/invoicing/InvoiceTrackerPage';
import InvoiceRecordPage from './pages/invoicing/InvoiceRecordPage';
import ShipmentCyclesPage from './pages/ShipmentCyclesPage';
import StandardOrderBuilderPage from './pages/StandardOrderBuilderPage';
import MarkShippedPage from './pages/MarkShippedPage';
import BinManagerPage from './pages/BinManagerPage';
import StockLevelsPage from './pages/StockLevelsPage';
import MidCycleOrdersPage from './pages/MidCycleOrdersPage';
import ResolutionCenterPage from './pages/ResolutionCenterPage';
import TrackingImportPage from './pages/TrackingImportPage';
import WeeklyRequirementsPage from './pages/WeeklyRequirementsPage';
import PartyShipmentsPage from './pages/PartyShipmentsPage';
import FmWorkdayPage from './pages/FmWorkdayPage';
import ClassRoomPage from './pages/ClassRoomPage';
import ProfessorTodayPage from './pages/ProfessorTodayPage';
import ProfessorPayPage from './pages/ProfessorPayPage';
import ProfessorAttendancePage from './pages/ProfessorAttendancePage';
import ClassroomAttendancePage from './pages/ClassroomAttendancePage';
import ClassPlannerPage from './pages/ClassPlannerPage';
import BugBountyPage from './pages/BugBountyPage';
import SchoolInfoSheetPage from './pages/SchoolInfoSheetPage';
import RosterApprovalsPage from './pages/RosterApprovalsPage';
import CurriculumSettingPage from './pages/CurriculumSettingPage';
import UnscheduledProgramsPage from './pages/UnscheduledProgramsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/professors" element={<ProtectedRoute><ProfessorsPage /></ProtectedRoute>} />
      <Route path="/professors/new" element={<ProtectedRoute><ProfessorDetailPage /></ProtectedRoute>} />
      <Route path="/professors/:id" element={<ProtectedRoute><ProfessorDetailPage /></ProtectedRoute>} />
      <Route path="/locations" element={<ProtectedRoute><LocationsPage /></ProtectedRoute>} />
      <Route path="/locations/new" element={<ProtectedRoute><LocationDetailPage /></ProtectedRoute>} />
      <Route path="/locations/:id" element={<ProtectedRoute><LocationDetailPage /></ProtectedRoute>} />
      <Route path="/programs" element={<ProtectedRoute><ProgramsPage /></ProtectedRoute>} />
      <Route path="/programs/new" element={<ProtectedRoute><ProgramDetailPage /></ProtectedRoute>} />
      <Route path="/programs/:id" element={<ProtectedRoute><ProgramDetailPage /></ProtectedRoute>} />
      <Route path="/programs/:id/classroom" element={<ProtectedRoute><ClassRoomPage /></ProtectedRoute>} />
      <Route path="/my-today" element={<ProtectedRoute><ProfessorTodayPage /></ProtectedRoute>} />
      <Route path="/my-pay" element={<ProtectedRoute><ProfessorPayPage /></ProtectedRoute>} />
      <Route path="/my-attendance" element={<ProtectedRoute><ProfessorAttendancePage /></ProtectedRoute>} />
      <Route path="/classroom-attendance" element={<ProtectedRoute><ClassroomAttendancePage /></ProtectedRoute>} />
      <Route path="/class-planner" element={<ProtectedRoute><ClassPlannerPage /></ProtectedRoute>} />
      <Route path="/curriculum-setting" element={<ProtectedRoute><CurriculumSettingPage /></ProtectedRoute>} />
      <Route path="/unscheduled-programs" element={<ProtectedRoute><UnscheduledProgramsPage /></ProtectedRoute>} />
      <Route path="/bug-bounty" element={<ProtectedRoute><BugBountyPage /></ProtectedRoute>} />
      <Route path="/locations/:id/info-sheet" element={<ProtectedRoute><SchoolInfoSheetPage /></ProtectedRoute>} />
      <Route path="/roster-approvals" element={<ProtectedRoute><RosterApprovalsPage /></ProtectedRoute>} />
      <Route path="/parties" element={<ProtectedRoute><PartiesPage /></ProtectedRoute>} />
      <Route path="/parties/new" element={<ProtectedRoute><PartyDetailPage /></ProtectedRoute>} />
      <Route path="/parties/:id" element={<ProtectedRoute><PartyDetailPage /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
      <Route path="/users/new" element={<ProtectedRoute><UserDetailPage /></ProtectedRoute>} />
      <Route path="/users/:id" element={<ProtectedRoute><UserDetailPage /></ProtectedRoute>} />
      <Route path="/students" element={<ProtectedRoute><StudentsPage /></ProtectedRoute>} />
      <Route path="/students/new" element={<ProtectedRoute><StudentDetailPage /></ProtectedRoute>} />
      <Route path="/students/:id" element={<ProtectedRoute><StudentDetailPage /></ProtectedRoute>} />
      <Route path="/bulk-input" element={<ProtectedRoute><BulkInputPage /></ProtectedRoute>} />
      <Route path="/contractors" element={<ProtectedRoute><ContractorsPage /></ProtectedRoute>} />
      <Route path="/contractors/:id" element={<ProtectedRoute><ContractorDetailPage /></ProtectedRoute>} />
      <Route path="/lessons" element={<ProtectedRoute><LessonsPage /></ProtectedRoute>} />
      <Route path="/lessons/new" element={<ProtectedRoute><LessonDetailPage /></ProtectedRoute>} />
      <Route path="/lessons/:id" element={<ProtectedRoute><LessonDetailPage /></ProtectedRoute>} />
      <Route path="/modules/:id" element={<ProtectedRoute><ModuleDetailPage /></ProtectedRoute>} />
      <Route path="/holidays" element={<ProtectedRoute><HolidaysPage /></ProtectedRoute>} />
      <Route path="/holidays/new" element={<ProtectedRoute><HolidayDetailPage /></ProtectedRoute>} />
      <Route path="/holidays/:id" element={<ProtectedRoute><HolidayDetailPage /></ProtectedRoute>} />
      <Route path="/parents" element={<ProtectedRoute><ParentsPage /></ProtectedRoute>} />
      <Route path="/parents/new" element={<ProtectedRoute><ParentDetailPage /></ProtectedRoute>} />
      <Route path="/parents/:id" element={<ProtectedRoute><ParentDetailPage /></ProtectedRoute>} />
      <Route path="/assignment-board" element={<ProtectedRoute><AssignmentBoardPage /></ProtectedRoute>} />
      <Route path="/schedule" element={<ProtectedRoute><ProfessorSchedulePage /></ProtectedRoute>} />
      <Route path="/schedule/:id" element={<ProtectedRoute><ProfessorSchedulePage /></ProtectedRoute>} />
      <Route path="/areas" element={<ProtectedRoute><AreasPage /></ProtectedRoute>} />
      <Route path="/candidates" element={<ProtectedRoute><CandidatesPage /></ProtectedRoute>} />
      <Route path="/candidates/new" element={<ProtectedRoute><CandidateDetailPage /></ProtectedRoute>} />
      <Route path="/candidates/:id" element={<ProtectedRoute><CandidateDetailPage /></ProtectedRoute>} />
      <Route path="/candidates/:id/profile" element={<ProtectedRoute><CandidateProfilePage /></ProtectedRoute>} />
      <Route path="/onboarding-requirements" element={<ProtectedRoute><OnboardingRequirementsPage /></ProtectedRoute>} />
      <Route path="/onboarding-templates" element={<ProtectedRoute><OnboardingTemplatesPage /></ProtectedRoute>} />
      <Route path="/email-templates" element={<ProtectedRoute><EmailTemplatesPage /></ProtectedRoute>} />
      <Route path="/pending-approvals" element={<ProtectedRoute><PendingApprovalsPage /></ProtectedRoute>} />
      <Route path="/payroll" element={<ProtectedRoute><PayrollDashboardPage /></ProtectedRoute>} />
      <Route path="/payroll/runs" element={<ProtectedRoute><PayrollRunsPage /></ProtectedRoute>} />
      <Route path="/payroll/misc-pay" element={<ProtectedRoute><MiscPayPage /></ProtectedRoute>} />
      <Route path="/payroll/fm-log" element={<ProtectedRoute><FmDailyLogPage /></ProtectedRoute>} />
      <Route path="/fm/workday" element={<ProtectedRoute><FmWorkdayPage /></ProtectedRoute>} />
      <Route path="/payroll/gusto-codes" element={<ProtectedRoute><GustoCodesPage /></ProtectedRoute>} />
      <Route path="/payroll/session-pay" element={<ProtectedRoute><SessionPayPage /></ProtectedRoute>} />
      <Route path="/payroll/onboarding-pay" element={<ProtectedRoute><OnboardingPayPage /></ProtectedRoute>} />
      <Route path="/payroll/mileage" element={<ProtectedRoute><MileagePage /></ProtectedRoute>} />
      <Route path="/report-builder" element={<ProtectedRoute><ReportBuilderPage /></ProtectedRoute>} />
      <Route path="/team-dashboard" element={<ProtectedRoute><TeamDashboardPage /></ProtectedRoute>} />
      <Route path="/report-fields" element={<ProtectedRoute><ReportFieldConfigPage /></ProtectedRoute>} />
      <Route path="/tool-manager" element={<ProtectedRoute><ToolManagerPage /></ProtectedRoute>} />
      <Route path="/sub-management" element={<ProtectedRoute><SubManagementPage /></ProtectedRoute>} />
      <Route path="/weekly-overview" element={<ProtectedRoute><WeeklyOverviewPage /></ProtectedRoute>} />
      <Route path="/evaluations" element={<ProtectedRoute><EvaluationDashboardPage /></ProtectedRoute>} />
      <Route path="/observation-lookup" element={<ProtectedRoute><ObservationLookupPage /></ProtectedRoute>} />
      <Route path="/observation-history" element={<ProtectedRoute><ObservationHistoryPage /></ProtectedRoute>} />
      <Route path="/party-confirms" element={<ProtectedRoute><PartyConfirmsPage /></ProtectedRoute>} />
      <Route path="/hiring-requests" element={<ProtectedRoute><HiringRequestsPage /></ProtectedRoute>} />
      <Route path="/area-pay-rates" element={<ProtectedRoute><AreaPayRatesPage /></ProtectedRoute>} />
      <Route path="/party-email-templates" element={<ProtectedRoute><PartyEmailTemplatesPage /></ProtectedRoute>} />
      <Route path="/party-calendar" element={<ProtectedRoute><PartyCalendarPage /></ProtectedRoute>} />
      <Route path="/parties/assign" element={<ProtectedRoute><PartyAssignPage /></ProtectedRoute>} />
      <Route path="/incident-report" element={<ProtectedRoute><IncidentReportPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/client-management/templates" element={<ProtectedRoute><ClientTemplatesPage /></ProtectedRoute>} />
      <Route path="/client-management/emails" element={<ProtectedRoute><ClientEmailsPage /></ProtectedRoute>} />
      <Route path="/client-management/feedback" element={<ProtectedRoute><FeedbackToolsPage /></ProtectedRoute>} />
      <Route path="/client-management/starting-emails" element={<ProtectedRoute><StartingEmailsPage /></ProtectedRoute>} />
      <Route path="/client-management/first-day-parent" element={<ProtectedRoute><FirstDayParentPage /></ProtectedRoute>} />
      <Route path="/client-management/second-week" element={<ProtectedRoute><SecondWeekPage /></ProtectedRoute>} />
      <Route path="/client-management/sub-emails" element={<ProtectedRoute><SubEmailsPage /></ProtectedRoute>} />
      <Route path="/client-management/new-professor" element={<ProtectedRoute><NewProfessorPage /></ProtectedRoute>} />
      <Route path="/client-management/last-day" element={<ProtectedRoute><LastDayPage /></ProtectedRoute>} />
      <Route path="/client-management/parent-feedback" element={<ProtectedRoute><ParentFeedbackPage /></ProtectedRoute>} />
      <Route path="/client-management/site-check-ins" element={<ProtectedRoute><SiteCheckInsPage /></ProtectedRoute>} />
      <Route path="/client-management/nps-emails" element={<ProtectedRoute><NpsEmailsPage /></ProtectedRoute>} />
      <Route path="/client-management/roster-emails" element={<ProtectedRoute><RosterEmailsPage /></ProtectedRoute>} />
      <Route path="/client-management/rebooking" element={<ProtectedRoute><RebookingPage /></ProtectedRoute>} />
      <Route path="/invoicing/queue" element={<ProtectedRoute><InvoiceQueuePage /></ProtectedRoute>} />
      <Route path="/invoicing/monthly" element={<ProtectedRoute><MonthlyInvoicingPage /></ProtectedRoute>} />
      <Route path="/invoicing/tracker" element={<ProtectedRoute><InvoiceTrackerPage /></ProtectedRoute>} />
      <Route path="/invoicing/records" element={<ProtectedRoute><InvoiceRecordPage /></ProtectedRoute>} />
      <Route path="/materials/cycles" element={<ProtectedRoute><ShipmentCyclesPage /></ProtectedRoute>} />
      <Route path="/materials/standard-order" element={<ProtectedRoute><StandardOrderBuilderPage /></ProtectedRoute>} />
      <Route path="/materials/mark-shipped" element={<ProtectedRoute><MarkShippedPage /></ProtectedRoute>} />
      <Route path="/materials/bins" element={<ProtectedRoute><BinManagerPage /></ProtectedRoute>} />
      <Route path="/materials/stock" element={<ProtectedRoute><StockLevelsPage /></ProtectedRoute>} />
      <Route path="/materials/mid-cycle" element={<ProtectedRoute><MidCycleOrdersPage /></ProtectedRoute>} />
      <Route path="/materials/resolutions" element={<ProtectedRoute><ResolutionCenterPage /></ProtectedRoute>} />
      <Route path="/materials/tracking" element={<ProtectedRoute><TrackingImportPage /></ProtectedRoute>} />
      <Route path="/materials/weekly-requirements" element={<ProtectedRoute><WeeklyRequirementsPage /></ProtectedRoute>} />
      <Route path="/materials/parties" element={<ProtectedRoute><PartyShipmentsPage /></ProtectedRoute>} />

      <Route path="/candidate-portal" element={<ProtectedRoute><CandidatePortalPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
