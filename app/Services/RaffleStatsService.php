<?php

namespace App\Services;

use App\Enums\ParticipantStatus;
use App\Enums\RaffleStatus;
use App\Models\DrawEvent;
use App\Models\Participant;
use App\Models\Raffle;
use App\Models\Winner;
use Illuminate\Support\Carbon;

/** Aggregates the numbers shown on the admin dashboard. */
class RaffleStatsService
{
    public function dashboard(): array
    {
        return [
            'totals' => [
                'participants' => Participant::query()->count(),
                'active_participants' => Participant::query()->where('status', ParticipantStatus::Active->value)->count(),
                'active_raffles' => Raffle::query()->notArchived()->active()->count(),
                'winners' => Winner::query()->count(),
                'completed_raffles' => Raffle::query()->notArchived()->where('status', RaffleStatus::Completed->value)->count(),
                'draft_raffles' => Raffle::query()->notArchived()->where('status', RaffleStatus::Draft->value)->count(),
            ],
            'status_breakdown' => $this->statusBreakdown(),
            'category_breakdown' => $this->categoryBreakdown(),
            'draws_by_day' => $this->drawsByDay(),
            'recent_raffles' => $this->recentRaffles(),
            'recent_winners' => $this->recentWinners(),
        ];
    }

    protected function statusBreakdown(): array
    {
        $counts = Raffle::query()
            ->notArchived()
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return collect(RaffleStatus::values())
            ->map(fn (string $status) => [
                'status' => $status,
                'total' => (int) ($counts[$status] ?? 0),
            ])
            ->all();
    }

    protected function categoryBreakdown(): array
    {
        return Participant::query()
            ->selectRaw('coalesce(category, \'UNCATEGORISED\') as category, count(*) as total')
            ->groupBy('category')
            ->orderByDesc('total')
            ->limit(8)
            ->get()
            ->map(fn ($row) => ['category' => $row->category, 'total' => (int) $row->total])
            ->all();
    }

    protected function drawsByDay(int $days = 14): array
    {
        $since = Carbon::today()->subDays($days - 1);

        $counts = DrawEvent::query()
            ->where('created_at', '>=', $since)
            ->where('result', 'SUCCESS')
            ->get(['created_at'])
            ->groupBy(fn ($event) => $event->created_at->toDateString())
            ->map->count();

        $series = [];

        for ($i = 0; $i < $days; $i++) {
            $date = $since->copy()->addDays($i)->toDateString();
            $series[] = ['date' => $date, 'draws' => (int) ($counts[$date] ?? 0)];
        }

        return $series;
    }

    protected function recentRaffles(int $limit = 5): array
    {
        return Raffle::query()
            ->notArchived()
            ->withCount(['winners as winners_drawn_count'])
            ->latest('updated_at')
            ->limit($limit)
            ->get()
            ->map(fn (Raffle $raffle) => [
                'id' => $raffle->id,
                'name' => $raffle->name,
                'slug' => $raffle->slug,
                'prize_name' => $raffle->prize_name,
                'status' => $raffle->status->value,
                'winners_count' => $raffle->winners_count,
                'winners_drawn' => (int) ($raffle->winners_drawn_count ?? 0),
                'updated_at' => $raffle->updated_at?->toIso8601String(),
            ])
            ->all();
    }

    protected function recentWinners(int $limit = 6): array
    {
        return Winner::query()
            ->with('raffle:id,name,prize_name')
            ->latest('drawn_at')
            ->limit($limit)
            ->get()
            ->map(fn (Winner $winner) => [
                'id' => $winner->id,
                'ticket_number' => $winner->ticket_number,
                'position' => $winner->position,
                'raffle' => $winner->raffle?->name,
                'prize_name' => $winner->raffle?->prize_name,
                'drawn_at' => $winner->drawn_at?->toIso8601String(),
            ])
            ->all();
    }
}
