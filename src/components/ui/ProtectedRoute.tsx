import React, { ReactNode, useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requireStudent?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false, requireStudent = false }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const [retryCount, setRetryCount] = useState(0);
  const [hasTriedReload, setHasTriedReload] = useState(false);

  // Show loading only during initial auth check
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if no user
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If user exists but no profile, show error with controlled retry
  if (!profile) {
    // Prevent infinite refresh loops by limiting retries
    if (retryCount > 3) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="bg-red-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <span className="text-red-600 text-xl">⚠️</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Profile Loading Failed</h3>
            <p className="text-sm text-gray-600 mb-4">
              Unable to load your profile after multiple attempts. Please try logging in again.
            </p>
            <button
              onClick={() => {
                // Clear auth state and redirect to login
                window.location.href = '/login';
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Return to Login
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="bg-yellow-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <span className="text-yellow-600 text-xl">⏳</span>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Profile</h3>
          <p className="text-sm text-gray-600 mb-4">
            Setting up your profile... This may take a moment.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => {
                setRetryCount(prev => prev + 1);
                window.location.reload();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry ({retryCount + 1}/3)
            </button>
            <button
              onClick={() => {
                window.location.href = '/login';
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Check role-based access
  if (requireAdmin && profile.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireStudent && profile.role !== 'student') {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}