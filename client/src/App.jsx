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
