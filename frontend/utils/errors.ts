import axios, { AxiosError } from 'axios';

type ErrorResponse = {
  error?: string;
  message?: string;
  errors?: Array<string | { message?: string; detail?: string }>;
};

export function getApiErrorMessage(error: unknown, fallbackMessage: string): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ErrorResponse | string>;
    const responseData = axiosError.response?.data;

    if (!responseData) {
      return fallbackMessage;
    }

    if (typeof responseData === 'string') {
      return responseData;
    }

    if (responseData.error) {
      return responseData.error;
    }

    if (responseData.message) {
      return responseData.message;
    }

    if (Array.isArray(responseData.errors) && responseData.errors.length > 0) {
      const firstError = responseData.errors[0];
      if (typeof firstError === 'string') {
        return firstError;
      }

      if (firstError?.message) {
        return firstError.message;
      }

      if (firstError?.detail) {
        return firstError.detail;
      }
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}
