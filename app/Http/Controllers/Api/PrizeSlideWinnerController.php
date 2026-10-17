<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PrizeSlideResource;
use App\Enums\DrawResult;
use App\Enums\RaffleStatus;
use App\Models\DrawEvent;
use App\Models\Participant;
use App\Models\PrizeSlide;
use App\Models\PrizeSlideWinner;
use App\Models\Raffle;
use App\Models\RaffleFile;
use App\Models\Winner;
use App\Services\RaffleFileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * The winners of a raffle drawn by hand on stage. As the host announces a
 * name, the operator finds the person in the participant list of a raffle
 * file (the same list the manual raffle was drawn from) and puts them on
 * the Prize Display, which lists them like a finished raffle's winners.
 *
 * Each winner is saved like a drawn one too: the prize gets a raffle of its
 * own the first time a winner goes up, and every winner on the screen is a
 * row in that raffle's winners, so the manual draw is in the Winners page,
 * the reports and the exports, with its people marked WINNER.
 */
class PrizeSlideWinnerController extends Controller
{
    // The most matches a search shows at once.
    private const LIMIT = 12;

    public function __construct(private readonly RaffleFileService $files)
    {
    }

    /**
     * A winner put up on stage sits out every other draw of the event: the
     * file's participant lists are marked again so they show as a winner
     * everywhere (and come back when taken off).
     */
    private function resync(PrizeSlide $prizeSlide, ?Participant ...$people): void
    {
        $fileIds = collect($people)->filter()->map(fn (Participant $person) => $person->raffle?->raffle_file_id)
            ->merge(
                $prizeSlide->winners()->with('participant.raffle')->get()
                    ->map(fn (PrizeSlideWinner $winner) => $winner->participant?->raffle?->raffle_file_id),
            )
            ->filter()->unique();

        foreach (RaffleFile::query()->whereIn('id', $fileIds)->get() as $file) {
            $this->files->resyncWinnerMarks($file);
        }
    }

    /**
     * People in a raffle file's participant list who match the search, each
     * ticket once, for the operator to pick from. Every raffle in the file
     * carries the same list, so the search runs across all of them.
     */
    public function search(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403);

        $files = RaffleFile::query()->orderByDesc('id')->get(['id', 'name', 'participants_count']);
        $fileId = $request->integer('file') ?: $files->first()?->id;
        $term = trim($request->string('q')->toString());

        $people = [];
        if ($fileId && $term !== '') {
            $people = Participant::query()
                ->whereIn('raffle_id', fn ($q) => $q->select('id')->from('raffles')->where('raffle_file_id', $fileId))
                ->search($term)
                ->select(['ticket_number', 'name', 'category', 'location', DB::raw('MIN(id) as id')])
                ->groupBy('ticket_number', 'name', 'category', 'location')
                ->orderBy('name')
                ->orderBy('ticket_number')
                ->limit(self::LIMIT + 1)
                ->get()
                ->map(fn ($person) => [
                    'participant_id' => (int) $person->id,
                    'ticket_number' => $person->ticket_number,
                    'name' => $person->name,
                    'category' => $person->category,
                    'location' => $person->location,
                ])
                ->all();
        }

        return response()->json([
            'data' => array_slice($people, 0, self::LIMIT),
            'more' => count($people) > self::LIMIT,
            'file' => $fileId,
            'files' => $files->map(fn ($file) => [
                'id' => $file->id,
                'name' => $file->name,
                'participants_count' => (int) $file->participants_count,
            ]),
        ]);
    }

    /** Puts a winner on the screen, after the ones already there. */
    public function store(Request $request, PrizeSlide $prizeSlide): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403);

        $data = $request->validate([
            'participant_id' => ['nullable', 'integer', Rule::exists('participants', 'id')],
            // Typed by hand when the person is not in any list.
            'name' => ['required_without:participant_id', 'nullable', 'string', 'max:255'],
            'ticket_number' => ['nullable', 'string', 'max:64'],
        ]);

        $participant = isset($data['participant_id']) ? Participant::find($data['participant_id']) : null;
        $name = trim((string) ($data['name'] ?? '')) ?: trim((string) $participant?->name) ?: $participant?->ticket_number;

        if (blank($name)) {
            return response()->json(['message' => 'A winner needs a name.'], 422);
        }

        $winner = DB::transaction(function () use ($request, $prizeSlide, $participant, $data, $name) {
            $winner = $prizeSlide->winners()->create([
                'participant_id' => $participant?->id,
                'ticket_number' => $data['ticket_number'] ?? $participant?->ticket_number,
                'name' => $name,
                'position' => (int) $prizeSlide->winners()->max('position') + 1,
            ]);
            $this->saveAsRaffleWinner($request, $prizeSlide, $winner, $participant);

            return $winner;
        });

        $prizeSlide->touch();
        $this->resync($prizeSlide, $participant);

        return response()->json(['data' => new PrizeSlideResource($prizeSlide->refresh()->load('winners')), 'winner_id' => $winner->id], 201);
    }

    /** Takes one winner off the screen; the others close the gap. */
    public function destroy(Request $request, PrizeSlide $prizeSlide, PrizeSlideWinner $winner): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403);
        abort_unless($winner->prize_slide_id === $prizeSlide->id, 404);

        $person = $winner->participant;
        DB::transaction(function () use ($prizeSlide, $winner) {
            $winner->winner?->delete();
            $winner->delete();
            $prizeSlide->winners()->get()->values()->each(fn ($left, $index) => $left->update(['position' => $index + 1]));
            $this->renumberRaffleWinners($prizeSlide);
        });
        $prizeSlide->touch();
        $this->resync($prizeSlide, $person);

        return response()->json(['data' => new PrizeSlideResource($prizeSlide->refresh()->load('winners'))]);
    }

    /** Takes every winner off the screen, leaving the prize on its own. */
    public function clear(Request $request, PrizeSlide $prizeSlide): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403);

        $people = $prizeSlide->winners()->with('participant')->get()->map(fn (PrizeSlideWinner $winner) => $winner->participant)->all();
        DB::transaction(function () use ($prizeSlide) {
            $prizeSlide->winners()->delete();
            $prizeSlide->raffle?->winners()->delete();
            $prizeSlide->raffle?->forceFill(['winners_count' => 1])->save();
        });
        $prizeSlide->touch();
        $this->resync($prizeSlide, ...$people);

        return response()->json(['data' => new PrizeSlideResource($prizeSlide->refresh()->load('winners'))]);
    }

    /**
     * Saves the winner in the prize's raffle, like one drawn here: the raffle
     * is made the first time a winner goes up, in the file the person was
     * found in, and keeps its winners out of every other draw of the event.
     */
    private function saveAsRaffleWinner(Request $request, PrizeSlide $prizeSlide, PrizeSlideWinner $winner, ?Participant $participant): void
    {
        $raffle = $this->raffleFor($request, $prizeSlide, $participant);
        $position = (int) $raffle->winners()->max('position') + 1;
        $ticket = (string) ($winner->ticket_number ?? '');

        $event = DrawEvent::create([
            'event_uuid' => (string) Str::uuid(),
            'raffle_id' => $raffle->id,
            'user_id' => $request->user()?->id,
            'sequence' => $position,
            'ticket_number' => $ticket,
            'result' => DrawResult::Success,
            'message' => Str::limit(sprintf('Winner #%d announced on stage for %s: %s.', $position, $prizeSlide->prize_name, $winner->name), 250),
            'eligible_count' => 0,
            'request_id' => $request->header('X-Request-Id'),
            'ip_address' => $request->ip(),
            'context' => ['announced_on_stage' => true, 'prize_slide_id' => $prizeSlide->id],
        ]);

        $saved = Winner::create([
            'raffle_id' => $raffle->id,
            'prize_name' => $prizeSlide->prize_name,
            'participant_id' => $participant?->id,
            'draw_event_id' => $event->id,
            'ticket_number' => $ticket,
            'position' => $position,
            'drawn_at' => now(),
            'drawn_by' => $request->user()?->id,
        ]);

        $winner->forceFill(['winner_id' => $saved->id])->save();
        $raffle->forceFill([
            'winners_count' => max($raffle->winners_count, $position),
            'status' => RaffleStatus::Completed,
            'completed_at' => $raffle->completed_at ?? now(),
        ])->save();
    }

    /** The prize's raffle, made on the first winner. */
    private function raffleFor(Request $request, PrizeSlide $prizeSlide, ?Participant $participant): Raffle
    {
        if ($prizeSlide->raffle) {
            return $prizeSlide->raffle;
        }

        $fileId = $participant?->raffle?->raffle_file_id ?? RaffleFile::query()->orderByDesc('id')->value('id');
        $name = trim((string) $prizeSlide->title) ?: $prizeSlide->prize_name;

        $raffle = Raffle::create([
            'raffle_file_id' => $fileId,
            'name' => $name,
            'slug' => $this->uniqueSlug($name),
            'description' => 'Drawn by hand on stage; winners put up from the Prize Display.',
            'prize_name' => $prizeSlide->prize_name,
            'prize_type' => $prizeSlide->prize_type ?? 'item',
            'prize_value' => $prizeSlide->prize_value,
            'prize_currency' => $prizeSlide->prize_currency ?? 'PHP',
            'logos' => $prizeSlide->logos ?? [],
            'logo_left' => $prizeSlide->logo_left,
            'logo_right' => $prizeSlide->logo_right,
            'winners_count' => 1,
            'status' => RaffleStatus::Completed,
            'winners_out_for_event' => true,
            'completed_at' => now(),
            'created_by' => $request->user()?->id,
        ]);

        $prizeSlide->forceFill(['raffle_id' => $raffle->id])->save();
        $prizeSlide->setRelation('raffle', $raffle);

        return $raffle;
    }

    /** Keeps the raffle's winners numbered 1, 2, 3... after one is taken off. */
    private function renumberRaffleWinners(PrizeSlide $prizeSlide): void
    {
        $raffle = $prizeSlide->raffle;
        if (! $raffle) {
            return;
        }

        $left = $raffle->winners()->orderBy('position')->get();
        // Positions are unique within a raffle, so move them out of the way first.
        $left->each(fn (Winner $w, $i) => $w->forceFill(['position' => 10000 + $i + 1])->save());
        $left->each(fn (Winner $w, $i) => $w->forceFill(['position' => $i + 1])->save());
        $raffle->forceFill(['winners_count' => max(1, $left->count())])->save();
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'raffle';
        $slug = $base;
        $i = 2;
        while (Raffle::query()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }
}
