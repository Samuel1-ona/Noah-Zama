import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import type { Signer } from 'ethers';
import { ProtocolClient } from '../protocol/ProtocolClient';
import type { Requirements, TransactionResult } from '../utils/types';

/**
 * Configuration options for useProtocol hook
 */
export interface UseProtocolOptions {
  protocolAddress?: string;
  userAddress?: string;
  enabled?: boolean;
  queryOptions?: {
    refetchInterval?: number;
    staleTime?: number;
  };
}

/**
 * Return type for useProtocol hook
 */
export interface UseProtocolReturn {
  protocol: ProtocolClient | null;

  requirements: Requirements | undefined;
  isLoadingRequirements: boolean;
  requirementsError: Error | null;
  refetchRequirements: () => void;

  hasAccess: boolean | undefined;
  isLoadingAccess: boolean;
  accessError: Error | null;
  refetchAccess: () => void;

  setRequirements: {
    mutate: (minAge: number) => void;
    mutateAsync: (minAge: number) => Promise<TransactionResult>;
    isLoading: boolean;
    error: Error | null;
    reset: () => void;
  };

  requestAccessVerification: {
    mutate: (userAddress: string) => void;
    mutateAsync: (userAddress: string) => Promise<TransactionResult>;
    isLoading: boolean;
    error: Error | null;
    reset: () => void;
  };
}

/**
 * React hook for protocol operations (FHE version)
 */
export function useProtocol(
  signer: Signer | null | undefined,
  options: UseProtocolOptions = {}
): UseProtocolReturn {
  const {
    protocolAddress,
    userAddress,
    enabled = true,
    queryOptions = {},
  } = options;

  const queryClient = useQueryClient();

  const protocol = useMemo(() => {
    if (!signer) return null;
    return new ProtocolClient(signer);
  }, [signer]);

  const [currentProtocolAddress, setCurrentProtocolAddress] = useState<string | undefined>(protocolAddress);

  useEffect(() => {
    if (protocolAddress) {
      setCurrentProtocolAddress(protocolAddress);
    } else if (signer) {
      signer.getAddress().then(address => setCurrentProtocolAddress(address));
    }
  }, [protocolAddress, signer]);

  // Query: Get protocol requirements
  const {
    data: requirements,
    isLoading: isLoadingRequirements,
    error: requirementsError,
    refetch: refetchRequirements,
  } = useQuery({
    queryKey: ['protocol', 'requirements', currentProtocolAddress],
    queryFn: async () => {
      if (!protocol || !currentProtocolAddress) throw new Error('Missing params');
      return protocol.getRequirements(currentProtocolAddress);
    },
    enabled: enabled && !!protocol && !!currentProtocolAddress,
    ...queryOptions,
  });

  // Query: Check user access
  const {
    data: hasAccess,
    isLoading: isLoadingAccess,
    error: accessError,
    refetch: refetchAccess,
  } = useQuery({
    queryKey: ['protocol', 'access', currentProtocolAddress, userAddress],
    queryFn: async () => {
      if (!protocol || !currentProtocolAddress || !userAddress) throw new Error('Missing params');
      return protocol.checkUserAccess(currentProtocolAddress, userAddress);
    },
    enabled: enabled && !!protocol && !!currentProtocolAddress && !!userAddress,
    ...queryOptions,
  });

  // Mutation: Set requirements
  const setRequirementsMutation = useMutation({
    mutationFn: async (minAge: number) => {
      if (!protocol) throw new Error('Protocol client missing');
      return protocol.setRequirements(minAge);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol', 'requirements'] });
    },
  });

  // Mutation: Request access verification
  const requestAccessMutation = useMutation({
    mutationFn: async (userAddress: string) => {
      if (!protocol) throw new Error('Protocol client missing');
      return protocol.requestAccessVerification(userAddress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol', 'access'] });
    },
  });

  return {
    protocol,
    requirements,
    isLoadingRequirements,
    requirementsError: requirementsError as Error | null,
    refetchRequirements: () => refetchRequirements(),
    hasAccess,
    isLoadingAccess,
    accessError: accessError as Error | null,
    refetchAccess: () => refetchAccess(),
    setRequirements: {
      mutate: setRequirementsMutation.mutate,
      mutateAsync: setRequirementsMutation.mutateAsync,
      isLoading: setRequirementsMutation.isPending,
      error: setRequirementsMutation.error as Error | null,
      reset: setRequirementsMutation.reset,
    },
    requestAccessVerification: {
      mutate: requestAccessMutation.mutate,
      mutateAsync: requestAccessMutation.mutateAsync,
      isLoading: requestAccessMutation.isPending,
      error: requestAccessMutation.error as Error | null,
      reset: requestAccessMutation.reset,
    },
  };
}
