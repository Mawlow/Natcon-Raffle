<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('participants', function (Blueprint $table) {
            $table->id();
            // Every participant belongs to exactly one raffle: the CSV is imported
            // into a raffle, and deleting the raffle takes its entrants with it.
            $table->foreignId('raffle_id')->constrained()->cascadeOnDelete();
            // Ticket numbers are stored as strings so leading zeros (000001) are preserved.
            $table->string('ticket_number', 64);
            $table->string('name')->nullable();
            $table->string('email')->nullable();
            $table->string('phone', 64)->nullable();
            $table->string('category', 64)->nullable();
            $table->string('status', 24)->default('ACTIVE');
            $table->json('metadata')->nullable();
            $table->foreignId('import_batch_id')->nullable();
            $table->timestamps();

            // Unique per raffle, not globally — two raffles may both use ticket 000001.
            $table->unique(['raffle_id', 'ticket_number']);
            $table->index(['raffle_id', 'status']);
            $table->index(['raffle_id', 'category']);
            $table->index(['raffle_id', 'status', 'category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('participants');
    }
};
