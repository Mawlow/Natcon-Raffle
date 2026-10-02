<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Raffle;
use App\Services\RaffleDrawService;
use App\Support\RaffleLogos;
use Illuminate\Http\JsonResponse;

/**
 * Feeds the projector display.
 *
 * Everything returned here is shown to a room full of people: raffle
 * metadata, ticket numbers, each winner's name, and a sample of the names
 * still in play for the name roller. No email, phone or participant id is
 * ever included in this payload.
 */
class PublicDisplayController extends Controller
{
    public function __construct(protected RaffleDrawService $draws) {}

    public function show(Raffle $raffle): JsonResponse
    {
        $settings = $raffle->settings;

        return response()->json([
            'data' => [
                'id' => $raffle->id,
                'name' => $raffle->name,
                'slug' => $raffle->slug,
                'description' => $raffle->description,
                'prize_name' => $raffle->prize_name,
                'prize_type' => $raffle->prize_type ?? 'cash',
                'prize_value' => $raffle->prize_value !== null ? (float) $raffle->prize_value : null,
                'prize_currency' => $raffle->prize_currency,
                'logos' => RaffleLogos::findMany($raffle->logos),
                'logo_left' => RaffleLogos::find($raffle->logo_left),
                'logo_right' => RaffleLogos::find($raffle->logo_right),
                'winners_count' => (int) $raffle->winners_count,
                'status' => $raffle->status->value,
                'ticket_length' => $this->ticketLength($raffle),
                'eligible_count' => $this->draws->eligibleTicketCount($raffle),
                // Ticket numbers only — used purely to feed the roller animation.
                'sample_tickets' => $this->draws->sampleTicketNumbers($raffle, 120),
                // Names only — used purely to feed the name roller.
                'sample_names' => $this->draws->sampleNames($raffle, 120),
                'winners' => $raffle->winners()
                    ->with('participant:id,name')
                    ->get(['participant_id', 'ticket_number', 'position', 'drawn_at'])
                    ->map(fn ($winner) => [
                        'ticket_number' => $winner->ticket_number,
                        // The winner's name, which the screens show in place of the ticket.
                        'name' => $winner->participant?->name,
                        'position' => (int) $winner->position,
                        'drawn_at' => $winner->drawn_at?->toIso8601String(),
                    ]),
                'settings' => [
                    'sound_countdown' => (bool) ($settings?->sound_countdown ?? true),
                    'sound_drawing' => (bool) ($settings?->sound_drawing ?? true),
                    'sound_winner' => (bool) ($settings?->sound_winner ?? true),
                    'sound_celebration' => (bool) ($settings?->sound_celebration ?? true),
                    'show_confetti' => (bool) ($settings?->show_confetti ?? true),
                    'countdown_seconds' => (int) ($settings?->countdown_seconds ?? 3),
                    'roll_duration_ms' => (int) ($settings?->roll_duration_ms ?? 6000),
                    'draw_mode' => $settings?->draw_mode ?? 'one_by_one',
                ],
            ],
        ]);
    }

    /** Width used by the roller so cycling digits do not jump around. */
    protected function ticketLength(Raffle $raffle): int
    {
        $length = (int) $raffle->participants()
            ->selectRaw('max(length(ticket_number)) as ticket_length')
            ->value('ticket_length');

        return max(4, min($length ?: 6, 12));
    }
}
