import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
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
import LessonsPage from './pages/LessonsPage';
import LessonDetailPage from './pages/LessonDetailPage';
import ModuleDetailPage from './pages/ModuleDetailPage';
import HolidaysPage from './pages/HolidaysPage';
import HolidayDetailPage from './pages/HolidayDetailPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/programs" replace />} />
      <Route path="/professors" element={<ProtectedRoute><ProfessorsPage /></ProtectedRoute>} />
      <Route path="/professors/new" element={<ProtectedRoute><ProfessorDetailPage /></ProtectedRoute>} />
      <Route path="/professors/:id" element={<ProtectedRoute><ProfessorDetailPage /></ProtectedRoute>} />
      <Route path="/locations" element={<ProtectedRoute><LocationsPage /></ProtectedRoute>} />
      <Route path="/locations/new" element={<ProtectedRoute><LocationDetailPage /></ProtectedRoute>} />
      <Route path="/locations/:id" element={<ProtectedRoute><LocationDetailPage /></ProtectedRoute>} />
      <Route path="/programs" element={<ProtectedRoute><ProgramsPage /></ProtectedRoute>} />
      <Route path="/programs/new" element={<ProtectedRoute><ProgramDetailPage /></ProtectedRoute>} />
      <Route path="/programs/:id" element={<ProtectedRoute><ProgramDetailPage /></ProtectedRoute>} />
      <Route path="/parties" element={<ProtectedRoute><PartiesPage /></ProtectedRoute>} />
      <Route path="/parties/new" element={<ProtectedRoute><PartyDetailPage /></ProtectedRoute>} />
      <Route path="/parties/:id" element={<ProtectedRoute><PartyDetailPage /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
      <Route path="/users/new" element={<ProtectedRoute><UserDetailPage /></ProtectedRoute>} />
      <Route path="/users/:id" element={<ProtectedRoute><UserDetailPage /></ProtectedRoute>} />
      <Route path="/students" element={<ProtectedRoute><StudentsPage /></ProtectedRoute>} />
      <Route path="/students/new" element={<ProtectedRoute><StudentDetailPage /></ProtectedRoute>} />
      <Route path="/students/:id" element={<ProtectedRoute><StudentDetailPage /></ProtectedRoute>} />
      <Route path="/lessons" element={<ProtectedRoute><LessonsPage /></ProtectedRoute>} />
      <Route path="/lessons/new" element={<ProtectedRoute><LessonDetailPage /></ProtectedRoute>} />
      <Route path="/lessons/:id" element={<ProtectedRoute><LessonDetailPage /></ProtectedRoute>} />
      <Route path="/modules/:id" element={<ProtectedRoute><ModuleDetailPage /></ProtectedRoute>} />
      <Route path="/holidays" element={<ProtectedRoute><HolidaysPage /></ProtectedRoute>} />
      <Route path="/holidays/new" element={<ProtectedRoute><HolidayDetailPage /></ProtectedRoute>} />
      <Route path="/holidays/:id" element={<ProtectedRoute><HolidayDetailPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/programs" replace />} />
    </Routes>
  );
}
