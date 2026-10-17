<?php

namespace App\Http\Requests;

use App\Enums\ParticipantStatus;
use App\Services\ParticipantImportService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreParticipantRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isAdmin() ?? false;
    }

    public function rules(): array
    {
        $participantId = $this->route('participant')?->id;
        $raffleId = $this->route('raffle')?->id;

        return [
            'ticket_number' => [
                $this->isMethod('POST') ? 'required' : 'sometimes',
                'string',
                'max:64',
                'regex:'.ParticipantImportService::TICKET_PATTERN,
                // Unique within this raffle only — another raffle may reuse the number.
                Rule::unique('participants', 'ticket_number')
                    ->where('raffle_id', $raffleId)
                    ->ignore($participantId),
            ],
            'name' => ['nullable', 'string', 'max:160'],
            'email' => ['nullable', 'email', 'max:190'],
            'phone' => ['nullable', 'string', 'max:64'],
            'category' => ['nullable', 'string', 'max:64'],
            // The developers a participant qualified under, for drawing by developer.
            'developers' => ['nullable', 'array', 'max:50'],
            'developers.*' => ['string', 'max:160', 'distinct'],
            // Where the participant is from, for drawing by location ("Cebu").
            'location' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', Rule::in(ParticipantStatus::values())],
            'metadata' => ['nullable', 'array'],
        ];
    }

    public function messages(): array
    {
        return [
            'ticket_number.regex' => 'Ticket numbers may contain letters, numbers, spaces and # . _ / - only, and must include at least one letter or number.',
            'ticket_number.unique' => 'That ticket number is already used in this raffle.',
        ];
    }
}
