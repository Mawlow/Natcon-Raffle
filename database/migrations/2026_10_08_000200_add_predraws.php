<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Pre-draws: draws whose winners were chosen before the event. Each is a
     * raffle of its own — kept apart from the ordinary raffles — with the
     * participants copied from the raffle it was made from, a list of
     * pre-selected winners with their prizes, and a draw on the screens that
     * reveals them as if drawn there and then.
     */
    public function up(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->boolean('is_predraw')->default(false)->after('staged_winners');
            $table->foreignId('source_raffle_id')->nullable()->after('is_predraw')->constrained('raffles')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('source_raffle_id');
            $table->dropColumn('is_predraw');
        });
    }
};
