<?php

namespace App\Exceptions;

use App\Enums\DrawResult;
use RuntimeException;

class DrawException extends RuntimeException
{
    public function __construct(
        public readonly DrawResult $result,
        string $message,
        public readonly int $status = 422,
        public readonly ?string $auditMessage = null,
    ) {
        parent::__construct($message);
    }

    /** Text written to the audit log, which may be more technical than the user message. */
    public function auditMessage(): string
    {
        return $this->auditMessage ?? $this->getMessage();
    }

    public static function invalidStatus(string $message, ?string $auditMessage = null): self
    {
        return new self(DrawResult::InvalidStatus, $message, 409, $auditMessage);
    }

    public static function noEligibleParticipants(?string $auditMessage = null, ?string $message = null): self
    {
        return new self(
            DrawResult::NoEligibleParticipants,
            $message ?? 'There are no eligible ticket numbers left in this raffle pool.',
            422,
            $auditMessage,
        );
    }

    public static function allWinnersDrawn(): self
    {
        return new self(
            DrawResult::AllWinnersDrawn,
            'All winners for this raffle have already been drawn.',
            409,
            'All winner slots already filled.',
        );
    }
}
